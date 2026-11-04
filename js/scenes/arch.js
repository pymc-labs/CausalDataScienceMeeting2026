/* ==========================================================================
   Scene "arch" (slide 12, dark theme): River's architecture assembles.

   One SVG in world units. In the full view (steps 7 and 8) one unit is one
   stage px; steps 0-6 move a camera (the SVG viewBox) onto the part being
   explained, one part per step, so the camera travels along the network.
   Text has two levels of detail: block titles for the full view and small
   internal labels for the zoomed views, each at least 15 stage px on screen.
   Particles (aqua dots) travel along the active connectors.

   Every paper number comes from DECK_DATA.network. Synthetic values (token
   grid, graph draws, decomposition) are labelled "illustrative" on screen.
   ========================================================================== */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var DATA = window.DECK_DATA;
  var NET = DATA.network;
  var ease = Deck.ease;

  /* ---- World geometry ------------------------------------------------------ */
  var W = 1680, H = 660, HF = H / W;
  var RY = 76, RH = 190, CY = RY + RH / 2;            // main row
  var B = {
    inputs: { x: 0, w: 206 },
    enc: { x: 252, w: 206 },
    router: { x: 504, w: 206 },
    g: { x: 754, w: 142 },
    cond: { x: 940, w: 206 },
    dec: { x: 1192, w: 206 },
    out: { x: 1444, w: 232 }
  };
  // Camera per step: [x, y, width]; height = width * H / W.
  var CAMS = [
    [-115, 61, 560],   // 0 observed inputs
    [150, 61, 560],    // 1 shared encoder
    [402, 61, 560],    // 2 joint router
    [560, 61, 560],    // 3 sampled G
    [831, 40, 600],    // 4 graph conditioner (taller: the h bypass enters from the top)
    [1090, 61, 560],   // 5 conditional decoder
    [1154, 61, 560],   // 6 decoder + decomposition
    [0, 0, W],         // 7 full view, training
    [0, 0, W]          // 8 full view, inference
  ];
  var FULL = 7;                                        // first full-view step
  function clampStep(s) { return Math.max(0, Math.min(CAMS.length - 1, s | 0)); }
  var FS = { title: 18, sub: 15.5, mono: 15, hdr: 5.8, lab: 6, tag: 6.4 };

  // Illustrative dataset and graph draws.
  var INPUTS = [
    { name: 'TV', color: '#B4E7DD' }, { name: 'Search', color: '#93D9CB' }, { name: 'Social', color: '#74C9B9' },
    { name: 'Promo', color: '#9FAAE2' }, { name: 'Holiday', color: '#C6CCF1' }
  ];
  var LIVE_CHANNELS = 3, LIVE_CONTROLS = 2;
  var P_EDGE = [0.95, 0.88, 0.22, 0.84, 0.64];
  var SETTLED = [1, 1, 0, 1, 1];
  var FLICKER = [[1, 0, 1, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1], [1, 1, 1, 1, 0], [1, 0, 0, 1, 1], [1, 1, 1, 0, 1], [1, 1, 0, 1, 0]];
  var FLICKER_T = [0, 170, 320, 450, 560, 650, 730];
  var DRAW_MS = 120;
  var SETTLE_MS = 1500;                                // reduced motion: idle this long after a step

  // Training objective, built from the recorded loss weights.
  var LW = NET.lossWeights;
  function coef(w) { return w === 1 ? '' : (w === 0.5 ? '\\tfrac12' : String(w)); }
  var LOSS_TEX = '\\mathcal{L}_{\\text{train}} = ' +
    coef(LW.jointQuery) + '\\mathcal{L}^{\\text{qry}}_{\\text{joint}} + ' +
    coef(LW.jointContext) + '\\mathcal{L}^{\\text{ctx}}_{\\text{joint}} + ' +
    coef(LW.condQuery) + '\\mathcal{L}^{\\text{qry}}_{\\text{cond}} + ' +
    coef(LW.condContext) + '\\mathcal{L}^{\\text{ctx}}_{\\text{cond}} + ' +
    coef(LW.struct) + '\\mathcal{L}_{\\text{struct}}';

  // Particle routes and how strongly each one runs at each step.
  var FLOW = [
    {},
    { in: 1 },
    { in: 0.3, h: 1, finr: 0.8 },
    { h: 0.3, sg: 1 },
    { sg: 0.3, gc: 1, by: 1 },
    { gc: 0.3, by: 0.3, cd: 1, find: 0.8 },
    { cd: 0.3, 'do': 1 },
    { in: 0.2, h: 0.2, sg: 0.2, gc: 0.2, by: 0.2, cd: 0.2, 'do': 0.2, tbus: 1, tce: 1, tjl: 1, ttg: 1 },
    { in: 1, h: 1, sg: 1, gc: 1, by: 1, cd: 1, 'do': 1, finr: 0.7, find: 0.7 }
  ];

  /* ---- Helpers --------------------------------------------------------------- */
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function n2(v) { return Math.round(v * 100) / 100; }
  function txt(parent, x, y, s, cls, size, anchor) {
    var n = el('text', { x: n2(x), y: n2(y), 'class': cls, 'font-size': size, 'text-anchor': anchor || null }, parent);
    n.textContent = s;
    return n;
  }
  // Text with subscripts: parts like ['z', ['1'], ' = (d', ['t'], ', 2G − 1)'].
  function txtSub(parent, x, y, parts, cls, size) {
    var n = el('text', { x: n2(x), y: n2(y), 'class': cls, 'font-size': size }, parent);
    parts.forEach(function (p) {
      var s = el('tspan', null, n);
      if (Array.isArray(p)) {
        s.textContent = p[0];
        s.setAttribute('font-size', n2(size * 0.8));
        s.setAttribute('baseline-shift', 'sub');
      } else s.textContent = p;
    });
    return n;
  }
  function fmtInt(v) { return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  // Catmull-Rom through the points as cubic Bezier segments (without the leading move).
  function curveThrough(pts) {
    var d = '';
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += 'C' + n2(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + n2(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        n2(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + n2(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + n2(p2[0]) + ' ' + n2(p2[1]);
    }
    return d;
  }

  /* ---- Scene state ------------------------------------------------------------ */
  var svg, defs, L = {};
  var pieces = [];      // {node, from, only, lod, order, glow, textAt, on}
  var groups = [];      // focus groups: {node, fn, cls}
  var streams = [];     // flow-head streamlines
  var routes = [];      // particle routes
  var gEdges = [];      // edges of the sampled G card
  var msgs = [], pulses = [], msgShown = false;
  var refs = {};
  var uid = 0;

  var cam = { x: 0, y: 0, w: W }, camAnim = null, lastK = -1;
  var active = false, raf = 0, lastNow = 0;
  var step = 0, stepT0 = 0, reduced = false;
  var graphKey = '', counterVal = -1, discardFaded = false, bandAnim = null, bandW = 0;

  /* ---- Pieces: everything that appears or leaves with the steps ---------------------- */
  // textAt: steps at which the piece's labels show. Elsewhere its graphics stay as
  // context and its text fades, so no clipped words sit at the edges of a zoomed frame.
  function piece(parent, o) {
    var g = el('g', { 'class': 'ap' + (o.cls ? ' ' + o.cls : '') }, parent);
    var from = o.only ? o.only[0] : o.from;
    var p = {
      node: g, from: from, only: o.only || null, lod: o.lod || null,
      order: from * 100 + (o.order || 0), glow: !!o.glow, textAt: o.textAt || null, on: false
    };
    pieces.push(p);
    g.__piece = p;
    return g;
  }
  function fgroup(parent, fn) {
    var g = el('g', { 'class': 'fg' }, parent);
    if (fn) groups.push({ node: g, fn: fn, cls: '' });
    return g;
  }
  function dimAfter(k) { return function (s) { return s > k && s < FULL ? 'dim' : ''; }; }
  function shownAt(p, s) {
    if (p.only) return p.only.indexOf(s) !== -1;
    if (s < p.from) return false;
    if (p.lod === 'dt') return s < FULL;
    if (p.lod === 'ov') return s >= FULL;
    return true;
  }

  // A connector piece: solid lines draw with stroke-dashoffset; dashed or dotted
  // lines draw through a mask. head = [x, y, ux, uy] puts an arrowhead at (x, y).
  function connector(parent, d, o) {
    var g = piece(parent, {
      from: o.from, only: o.only, lod: o.lod, order: o.order, glow: o.glow,
      cls: 'cn tone-' + (o.tone || 'w') + (o.slim ? ' slim' : '')
    });
    if (o.glow) el('path', { d: d, 'class': 'halo' }, g);
    if (o.dash) {
      var id = 'arch-m' + (++uid);
      var m = el('mask', { id: id, maskUnits: 'userSpaceOnUse', x: -400, y: -400, width: 2600, height: 1500 }, g);
      el('path', { d: d, 'class': 'mk', pathLength: 1 }, m);
      el('path', { d: d, 'class': 'dl ' + o.dash, mask: 'url(#' + id + ')' }, g);
    } else {
      el('path', { d: d, 'class': 'ln', pathLength: 1 }, g);
    }
    if (o.head) {
      var h = o.head;
      el('path', { d: 'M' + n2(h[0] - h[2] * 0.5) + ' ' + n2(h[1] - h[3] * 0.5) + 'L' + n2(h[0]) + ' ' + n2(h[1]), 'class': 'hd' }, g);
    }
    return g;
  }

  function blockRect(parent, b, cls) {
    return el('rect', { x: b.x, y: RY, width: b.w, height: RH, rx: 7, 'class': 'blk' + (cls ? ' ' + cls : '') }, parent);
  }

  // A tag group: a coloured rule and mono lines (zoomed views only).
  function tags(parent, x, y, lines, o) {
    var lh = 11;
    var g = piece(parent, { only: o.only, order: o.order || 50 });
    el('path', { d: 'M' + (x - 6) + ' ' + (y - 6.2) + 'V' + n2(y + lh * (lines.length - 1) + 2.2), 'class': 'rule' + (o.peach ? ' p' : '') }, g);
    lines.forEach(function (ln, i) {
      if (Array.isArray(ln)) txtSub(g, x, y + i * lh, ln, 'tg', FS.tag);
      else txt(g, x, y + i * lh, ln, 'tg' + (o.dimLast && i === lines.length - 1 ? ' dimtext' : ''), FS.tag);
    });
    return g;
  }

  // Streamlines of a flow head with a travelling dot: from noise (left) to the target (right).
  function stream(parent, o) {
    var s = { path: el('path', { 'class': 'stream' + (o.ov ? ' ov' : '') }, parent), dot: null, o: o, host: parent };
    s.dot = el('circle', { r: o.ov ? 1.6 : 1.5, 'class': 'sdot' }, parent);
    streams.push(s);
    drawStream(s, 0);
    return s;
  }
  function streamY(o, u, t) {
    if (o.ye !== undefined) {
      var S = smooth(0.04, 0.96, u);
      return lerp(o.ys, o.ye, S) + o.amp * (1 - S) * Math.sin(2 * Math.PI * (1.15 * u + o.ph) + t * 1.4);
    }
    return o.y + o.amp * Math.sin(2 * Math.PI * (0.85 * u + o.ph) + t * 1.1);
  }
  function drawStream(s, t) {
    var o = s.o, d = '', N = 28;
    for (var j = 0; j <= N; j++) {
      var u = j / N;
      d += (j ? 'L' : 'M') + lerp(o.x0, o.x1, u).toFixed(2) + ' ' + streamY(o, u, t).toFixed(2);
    }
    s.path.setAttribute('d', d);
    var su = (((t * o.speed + o.ph) % 1) + 1) % 1;
    s.dot.setAttribute('cx', lerp(o.x0, o.x1, su).toFixed(2));
    s.dot.setAttribute('cy', streamY(o, su, t).toFixed(2));
    s.dot.setAttribute('opacity', (smooth(0, 0.08, su) * (1 - smooth(0.92, 1, su))).toFixed(3));
  }

  function maskIcon(parent, x, y, kind) {
    var n = 6, c = 2, d = '';
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if (kind === 'tri' && j > i) continue;
        d += 'M' + n2(x + j * c + 0.25) + ' ' + n2(y + i * c + 0.25) + 'h1.5v1.5h-1.5z';
      }
    }
    el('rect', { x: x - 0.5, y: y - 0.5, width: n * c + 1, height: n * c + 1, rx: 0.6, 'class': 'icon-frame' }, parent);
    el('path', { d: d, 'class': 'icon-cells' }, parent);
  }

  function xMark(parent, x, y, r, cls) {
    el('path', { d: 'M' + (x - r) + ' ' + (y - r) + 'L' + (x + r) + ' ' + (y + r) + 'M' + (x + r) + ' ' + (y - r) + 'L' + (x - r) + ' ' + (y + r), 'class': 'xmark' + (cls ? ' ' + cls : '') }, parent);
  }

  /* ---- Build ---------------------------------------------------------------------- */
  function buildDefs() {
    defs = el('defs', null, svg);
    [['w', 'rgba(243,246,251,.8)'], ['a', '#B4E7DD'], ['p', '#F6AE72'], ['v', '#9FAAE2']].forEach(function (m) {
      var mk = el('marker', { id: 'arch-ah-' + m[0], viewBox: '0 0 10 10', refX: 9.4, refY: 5, markerWidth: 4.4, markerHeight: 4.4, orient: 'auto', markerUnits: 'strokeWidth' }, defs);
      el('path', { d: 'M0 0.6L10 5L0 9.4L2.6 5Z', fill: m[1] }, mk);
    });
    var hatch = el('pattern', { id: 'arch-hatch', width: 1.7, height: 1.7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('rect', { x: 0, y: 0, width: 0.55, height: 1.7, fill: 'rgba(243,246,251,.55)' }, hatch);
  }

  // Observed inputs: weeks x (channels, controls, sales) token grid.
  function buildInputs() {
    var b = B.inputs, x0 = b.x;
    var wrap = fgroup(L.blocks, dimAfter(0));
    blockRect(piece(wrap, { from: 0, order: 0 }), b);
    var ovIn = piece(wrap, { from: 0, lod: 'ov', order: 1 });
    txt(ovIn, x0 + 12, 100, 'Observed inputs', 'tt', FS.title);
    txt(ovIn, x0 + 12, 238, 'spend · controls · sales', 'ts', FS.sub);
    var hd = piece(wrap, { from: 0, lod: 'dt', order: 1, textAt: [0] });
    txt(hd, x0 + 12, 93, 'OBSERVED INPUTS', 'th', FS.hdr);
    txt(hd, x0 + 194, 93, 'illustrative', 'th', FS.hdr, 'end');

    var gx = x0 + 12, gy = 110, gw = 182, gh = 102;
    var cols = Math.round(NET.encoderInput[0] / 4), rows = NET.encoderInput[1];
    var K = NET.padded.K, M = NET.padded.M;
    var cw = gw / cols, ch = gh / rows;
    var ctxCols = Math.round(DATA.evaluation.horizons[0].context / 4);
    var R = rng(11);
    var tv = [], se = [], so = [], pr = [], ho = [], sa = [], c, u;
    for (c = 0; c < cols; c++) {
      u = c / cols;
      tv.push((c % 13) < 6 ? 0.72 + 0.28 * R() : 0.05 * R());
      se.push(clamp(0.5 + 0.24 * Math.sin(2 * Math.PI * u * 4 + 0.6) + 0.2 * (R() - 0.5), 0, 1));
      so.push((c % 8) < 3 ? 0.55 + 0.4 * R() : 0.1 + 0.2 * R());
      pr.push(R() < 0.2 ? 0.8 + 0.2 * R() : 0.04 * R());
      ho.push(Math.pow(Math.max(0, Math.cos(2 * Math.PI * (u * 4 - 0.92))), 8));
    }
    for (c = 0; c < cols; c++) {
      u = c / cols;
      sa.push(clamp(0.3 + 0.16 * Math.sin(2 * Math.PI * (u * 4 - 0.15)) + 0.2 * tv[c] + 0.12 * se[c] + 0.14 * pr[c] + 0.16 * ho[c] + 0.08 * (R() - 0.5), 0, 1));
    }
    var liveCh = [tv, se, so], liveCo = [pr, ho];

    var grid = piece(wrap, { from: 0, order: 2 });
    var paths = {};
    function cell(key, cc, r) {
      var x = gx + cc * cw + 0.35, y = gy + r * ch + 0.35;
      paths[key] = (paths[key] || '') + 'M' + n2(x) + ' ' + n2(y) + 'h' + n2(cw - 0.7) + 'v' + n2(ch - 0.7) + 'h' + n2(0.7 - cw) + 'z';
    }
    for (var r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (r < K) {
          if (r < LIVE_CHANNELS) cell('a' + Math.round(liveCh[r][c] * 6), c, r);
          else cell('ap', c, r);
        } else if (r < K + M) {
          if (r - K < LIVE_CONTROLS) cell('v' + Math.round(liveCo[r - K][c] * 6), c, r);
          else cell('vp', c, r);
        } else if (c < ctxCols) cell('w' + Math.round(sa[c] * 6), c, r);
        else cell('q', c, r);
      }
    }
    var FILL = { a: '#B4E7DD', v: '#9FAAE2', w: '#F3F6FB' };
    Object.keys(paths).forEach(function (key) {
      if (key === 'q') { el('path', { d: paths[key], 'class': 'qcell' }, grid); return; }
      var pad = key.charAt(1) === 'p';
      var op = pad ? 0.1 : 0.16 + 0.84 * Number(key.slice(1)) / 6;
      el('path', { d: paths[key], fill: FILL[key.charAt(0)], 'fill-opacity': n2(op) }, grid);
    });
    // The query flag on the withheld sales cells.
    var fy = gy + (rows - 1) * ch;
    el('path', { d: 'M' + (gx + gw + 3) + ' ' + n2(fy + ch) + 'V' + n2(fy - 4.5) + 'h0.8V' + n2(fy + ch) + 'z' +
      'M' + (gx + gw + 3.8) + ' ' + n2(fy - 4.5) + 'L' + (gx + gw + 9.5) + ' ' + n2(fy - 2.2) + 'L' + (gx + gw + 3.8) + ' ' + n2(fy + 0.1) + 'z', 'class': 'flag' }, grid);
    var sx = gx + ctxCols * cw;
    el('path', { d: 'M' + n2(sx) + ' ' + (gy - 5) + 'V' + (gy + gh + 6), 'class': 'split' }, grid);

    var lab = piece(wrap, { from: 0, lod: 'dt', order: 3, textAt: [0] });
    txt(lab, gx, 226, 'context', 'tm aquat', FS.lab);
    txt(lab, gx, 235.5, 'sales observed', 'tm dimtext', FS.lab);
    txt(lab, sx + 4, 226, 'query', 'tm aquat', FS.lab);
    txt(lab, sx + 4, 235.5, 'sales withheld', 'tm dimtext', FS.lab);
    txt(lab, gx, 253, NET.encoderInput[0] + ' weeks × ' + NET.encoderInput[1] + ' rows × ' + NET.encoderInput[2] + ' features', 'tg', FS.tag);

    // Row groups, left of the block (step 0 framing).
    var side = piece(wrap, { from: 0, lod: 'dt', order: 4, textAt: [0] });
    var groupsY = [[0, K, 'up to ' + K + ' channels'], [K, K + M, 'up to ' + M + ' controls'], [K + M, rows, 'sales']];
    groupsY.forEach(function (gr) {
      var y0 = gy + gr[0] * ch + 0.6, y1 = gy + gr[1] * ch - 0.6;
      el('path', { d: 'M-4 ' + n2(y0) + 'H-7V' + n2(y1) + 'H-4', 'class': 'bracket' }, side);
      txt(side, -11, n2((y0 + y1) / 2 + 2.1), gr[2], 'tm dimtext', FS.lab, 'end');
    });
  }

  // Shared encoder: a residual stream with three pre-norm stages, repeated.
  function buildEncoder() {
    var b = B.enc, x0 = b.x;
    var wrap = fgroup(L.blocks, dimAfter(1));
    blockRect(piece(wrap, { from: 1, order: 0 }), b);
    var ov = piece(wrap, { from: 1, lod: 'ov', order: 1 });
    txt(ov, x0 + 14, 100, 'Shared encoder', 'tt', FS.title);
    txt(ov, x0 + 14, 125, 'causal time attention', 'ts', FS.sub);
    txt(ov, x0 + 14, 144, 'entity attention', 'ts', FS.sub);
    txt(ov, x0 + 14, 163, NET.encoderBlocks + ' blocks · width ' + NET.width, 'ts', FS.sub);
    txt(piece(wrap, { from: 1, lod: 'dt', order: 1, textAt: [1] }), x0 + 12, 93, 'SHARED ENCODER', 'th', FS.hdr);

    var sx = x0 + 28;
    var pj = piece(wrap, { from: 1, lod: 'dt', order: 2, textAt: [1] });
    el('rect', { x: x0 + 18, y: 99, width: 108, height: 13, rx: 2.5, 'class': 'ibox' }, pj);
    txt(pj, x0 + 72, 107.6, 'cell projection ' + NET.cellFeatures + ' → ' + NET.width, 'tm', FS.lab, 'middle');
    connector(wrap, 'M' + sx + ' 112V228', { from: 1, lod: 'dt', order: 3, slim: true });

    var stages = [
      { title: 'Time attention', sub: 'causal', icon: 'tri' },
      { title: 'Entity attention', sub: 'bidirectional', icon: 'full' },
      { title: 'SwiGLU FFN', sub: 'width ' + NET.ffnWidth }
    ];
    stages.forEach(function (s, k) {
      var y0 = 120 + 36 * k, ym = y0 + 7;
      var g = piece(wrap, { from: 1, lod: 'dt', order: 4 + k, textAt: [1] });
      el('circle', { cx: sx, cy: ym, r: 1.3, fill: 'rgba(243,246,251,.85)' }, g);
      el('path', { d: 'M' + sx + ' ' + ym + 'H' + (x0 + 38), 'class': 'thin' }, g);
      el('rect', { x: x0 + 38, y: y0, width: 36, height: 14, rx: 2.5, 'class': 'ibox' }, g);
      txt(g, x0 + 56, y0 + 9.2, 'RMSNorm', 'tl', 5.8, 'middle');
      el('path', { d: 'M' + (x0 + 74) + ' ' + ym + 'H' + (x0 + 80), 'class': 'thin' }, g);
      el('rect', { x: x0 + 80, y: y0 - 3, width: 88, height: 20, rx: 2.5, 'class': 'ibox' }, g);
      var tx = x0 + 84;
      if (s.icon) { maskIcon(g, x0 + 84, y0 + 1, s.icon); tx = x0 + 100; }
      txt(g, tx, y0 + 5.6, s.title, 'tl', FS.lab);
      txt(g, tx, y0 + 13.6, s.sub, 'tm dimtext', 5.8);
      el('path', { d: 'M' + (x0 + 168) + ' ' + ym + 'H' + (x0 + 175) + 'V' + (y0 + 24) + 'H' + n2(sx + 4.4), 'class': 'thin' }, g);
      var pl = el('g', { 'class': 'plus' }, g);
      el('circle', { cx: sx, cy: y0 + 24, r: 4.2 }, pl);
      el('path', { d: 'M' + n2(sx - 2.4) + ' ' + (y0 + 24) + 'H' + n2(sx + 2.4) + 'M' + sx + ' ' + n2(y0 + 21.6) + 'V' + n2(y0 + 26.4) }, pl);
    });
    var br = piece(wrap, { from: 1, lod: 'dt', order: 7, textAt: [1] });
    el('path', { d: 'M' + (x0 + 179) + ' 117H' + (x0 + 182) + 'V221H' + (x0 + 179), 'class': 'bracket' }, br);
    txt(br, x0 + 186, 172, '× ' + NET.encoderBlocks, 'tl', 6.6);
    var fn = piece(wrap, { from: 1, lod: 'dt', order: 8, textAt: [1] });
    el('rect', { x: sx - 18, y: 228, width: 36, height: 13, rx: 2.5, 'class': 'ibox' }, fn);
    txt(fn, sx, 236.8, 'RMSNorm', 'tl', 5.8, 'middle');
    txt(fn, sx + 23, 237, 'final', 'tm dimtext', 5.8);
  }

  // Joint router: the first flow head; its target holds d and the graph at +1 / -1.
  function buildRouter() {
    var b = B.router, x0 = b.x;
    var wrap = fgroup(L.blocks, dimAfter(2));
    blockRect(piece(wrap, { from: 2, order: 0 }), b, 'head');
    var ov = piece(wrap, { from: 2, lod: 'ov', order: 1 });
    txt(ov, x0 + 14, 100, 'Joint router', 'tt navy', FS.title);
    txt(ov, x0 + 14, 125, 'flow head', 'ts navy2', FS.sub);
    txt(ov, x0 + 14, 144, 'generates G and d', 'ts navy2', FS.sub);
    for (var k = 0; k < 3; k++) stream(ov, { x0: x0 + 14, x1: x0 + 192, y: 196 + 19 * k, amp: 4.5, ph: 0.23 * k, speed: 0.07, ov: true });
    txt(piece(wrap, { from: 2, lod: 'dt', order: 1, textAt: [2] }), x0 + 12, 93, 'JOINT ROUTER · FLOW HEAD', 'th navy2', FS.hdr);
    var st = piece(wrap, { from: 2, lod: 'dt', order: 2, textAt: [2, 3] });
    var ends = [108, 115, 122, 129, 160, 160, 160, 160, 184];
    var starts = [0, 3, 1, 5, 2, 7, 4, 8, 6];
    ends.forEach(function (ye, i) {
      stream(st, { x0: x0 + 12, x1: x0 + 178, ys: 112 + starts[i] * 15.2, ye: ye, amp: 5, ph: 0.137 * i, speed: 0.15 });
    });
    txt(st, x0 + 198, 120.6, 'd', 'tm navy', FS.lab, 'end');
    txt(st, x0 + 198, 162.2, '+1', 'tm navy', FS.lab, 'end');
    txt(st, x0 + 198, 186.2, '−1', 'tm navy', FS.lab, 'end');
    txt(st, x0 + 12, 254, 'τ = 0', 'tm navy2', FS.lab);
    txt(st, x0 + 106, 254, 'flow time', 'tm navy2', FS.lab, 'middle');
    txt(st, x0 + 178, 254, 'τ = 1', 'tm navy2', FS.lab, 'end');
  }

  // Sampled G: five inputs and sales, edges for one draw.
  function buildGraph() {
    var b = B.g, x0 = b.x;
    var wrap = fgroup(L.blocks, dimAfter(3));
    blockRect(piece(wrap, { from: 3, order: 1 }), b, 'gcard');
    txt(piece(wrap, { from: 3, lod: 'ov', order: 2 }), x0 + 12, 100, 'Sampled G', 'tt', FS.title);
    txt(piece(wrap, { from: 3, lod: 'dt', order: 2, textAt: [3] }), x0 + 10, 93, 'SAMPLED GRAPH G', 'th peacht', FS.hdr);
    var dag = piece(wrap, { from: 3, order: 3 });
    var nx = x0 + 64, sxs = x0 + 116, r = 8, rs = 12;
    var ys = [121, 146, 171, 196, 221];
    INPUTS.forEach(function (inp, k) {
      var y = ys[k], e = el('g', { 'class': 'ge e-on' }, dag);
      var a = [nx + r + 1, y], c = [nx + 32, y + (CY - y) * 0.12];
      var dx = sxs - c[0], dy = CY - c[1], dl = Math.hypot(dx, dy);
      var end = [sxs - dx / dl * (rs + 2.4), CY - dy / dl * (rs + 2.4)];
      var d = 'M' + n2(a[0]) + ' ' + n2(a[1]) + 'Q' + n2(c[0]) + ' ' + n2(c[1]) + ' ' + n2(end[0]) + ' ' + n2(end[1]);
      el('path', { d: d, 'class': 'gabs' }, e);
      el('path', { d: d, 'class': 'gpres' }, e);
      gEdges.push(e);
    });
    INPUTS.forEach(function (inp, k) { el('circle', { cx: nx, cy: ys[k], r: r, fill: inp.color }, dag); });
    el('circle', { cx: sxs, cy: CY, r: rs, 'class': 'node-sales' }, dag);
    var lb = piece(wrap, { from: 3, lod: 'dt', order: 4, textAt: [3, 4] });
    INPUTS.forEach(function (inp, k) { txt(lb, nx - 13, ys[k] + 2.2, inp.name, 'tl', 6.2, 'end'); });
    txt(lb, sxs, CY + 2.1, 'Sales', 'tl navy', 5.8, 'middle');
  }

  function quadEdge(a, c, e) { return { a: a, c: c, e: e }; }
  function quadAt(q, t) {
    var u = 1 - t;
    return [u * u * q.a[0] + 2 * u * t * q.c[0] + t * t * q.e[0], u * u * q.a[1] + 2 * u * t * q.c[1] + t * t * q.e[1]];
  }
  function edgeTo(from, to, rTo, bend) {
    var c = [from[0] + (to[0] - from[0]) * 0.45, from[1] + (to[1] - from[1]) * bend];
    var dx = to[0] - c[0], dy = to[1] - c[1], dl = Math.hypot(dx, dy);
    return quadEdge(from, c, [to[0] - dx / dl * (rTo + 2.4), to[1] - dy / dl * (rTo + 2.4)]);
  }
  function qd(q) { return 'M' + n2(q.a[0]) + ' ' + n2(q.a[1]) + 'Q' + n2(q.c[0]) + ' ' + n2(q.c[1]) + ' ' + n2(q.e[0]) + ' ' + n2(q.e[1]); }

  // Graph conditioner: one message pass along the sampled edges.
  function buildConditioner() {
    var b = B.cond, x0 = b.x;
    var wrap = fgroup(L.blocks, dimAfter(4));
    blockRect(piece(wrap, { from: 4, order: 1 }), b);
    var ov = piece(wrap, { from: 4, lod: 'ov', order: 2 });
    txt(ov, x0 + 14, 100, 'Graph', 'tt', FS.title);
    txt(ov, x0 + 14, 122, 'conditioner', 'tt', FS.title);
    txt(ov, x0 + 14, 147, 'one message pass', 'ts', FS.sub);
    txt(ov, x0 + 14, 166, 'along the sampled G', 'ts', FS.sub);
    txt(piece(wrap, { from: 4, lod: 'dt', order: 2, textAt: [4] }), x0 + 12, 93, 'GRAPH CONDITIONER', 'th', FS.hdr);

    var gr = piece(wrap, { from: 4, lod: 'dt', order: 3, textAt: [4, 5] });
    refs.condGraph = gr;
    var lx = x0 + 62, rx = x0 + 168;
    var S = [rx, 134], Bn = [rx, 202], U = [lx, 234];
    var nodes = [116, 134, 152, 184, 202];
    nodes.forEach(function (y, k) {
      var toSales = k < LIVE_CHANNELS;
      var q = edgeTo([lx + 7, y], toSales ? S : Bn, toSales ? 11 : 8, 0.12);
      el('path', { d: qd(q), 'class': SETTLED[k] ? 'gpres' : 'gabs' }, gr);
      if (SETTLED[k]) msgs.push({ q: q, node: null });
    });
    // Latent demand reaches sales only through the baseline node (slot db); there is no latent -> sales slot.
    el('path', { d: qd(edgeTo([U[0] + 7, U[1]], Bn, 8, 0.1)), 'class': 'goff' }, gr);
    xMark(gr, lx + 30, 223, 1.8);
    nodes.forEach(function (y, k) { el('circle', { cx: lx, cy: y, r: 6, fill: INPUTS[k].color }, gr); });
    el('circle', { cx: U[0], cy: U[1], r: 6, 'class': 'node-latent' }, gr);
    el('circle', { cx: S[0], cy: S[1], r: 11, 'class': 'node-sales' }, gr);
    el('circle', { cx: Bn[0], cy: Bn[1], r: 8, 'class': 'node-base' }, gr);
    txt(gr, S[0], S[1] + 2.1, 'Sales', 'tl navy', 5.8, 'middle');
    txt(gr, Bn[0], Bn[1] + 18, 'baseline', 'tm dimtext', FS.lab, 'middle');
    txt(gr, x0 + 10, 136.2, 'channels', 'tm dimtext', FS.lab);
    txt(gr, x0 + 10, 195.2, 'controls', 'tm dimtext', FS.lab);
    txt(gr, x0 + 10, 232.2, 'latent', 'tm dimtext', FS.lab);
    txt(gr, x0 + 10, 240.4, 'demand', 'tm dimtext', FS.lab);
    msgs.forEach(function (m) { m.node = el('circle', { 'class': 'pt msg', cx: -99, cy: -99, opacity: 0 }, gr); });
    [[S, 11], [Bn, 8]].forEach(function (n) {
      pulses.push({ r0: n[1], node: el('circle', { cx: n[0][0], cy: n[0][1], r: n[1], 'class': 'pulse', opacity: 0 }, gr) });
    });
  }

  // Conditional decoder: the second flow head, with its support mask.
  function buildDecoder() {
    var b = B.dec, x0 = b.x;
    var wrap = fgroup(L.blocks, null);
    blockRect(piece(wrap, { from: 5, order: 1 }), b, 'head');
    var ov = piece(wrap, { from: 5, lod: 'ov', order: 2 });
    txt(ov, x0 + 14, 100, 'Conditional', 'tt navy', FS.title);
    txt(ov, x0 + 14, 122, 'decoder', 'tt navy', FS.title);
    txt(ov, x0 + 14, 147, 'flow head · d given G', 'ts navy2', FS.sub);
    for (var k = 0; k < 3; k++) stream(ov, { x0: x0 + 14, x1: x0 + 192, y: 196 + 19 * k, amp: 4.5, ph: 0.31 + 0.23 * k, speed: 0.07, ov: true });
    txt(piece(wrap, { from: 5, lod: 'dt', order: 2, textAt: [5, 6] }), x0 + 12, 93, 'CONDITIONAL DECODER · FLOW HEAD', 'th navy2', FS.hdr);
    var st = piece(wrap, { from: 5, lod: 'dt', order: 3 });
    var ends = [110, 123, 136, 150, 164, 178];
    var starts = [1, 3, 0, 5, 2, 4];
    ends.forEach(function (ye, i) {
      stream(st, { x0: x0 + 12, x1: x0 + 184, ys: 106 + starts[i] * 17, ye: ye, amp: 4.5, ph: 0.19 * i + 0.05, speed: 0.15 });
    });

    var mk = piece(wrap, { from: 5, lod: 'dt', order: 4, textAt: [5, 6] });
    var K = NET.padded.K, M = NET.padded.M, n = NET.decoderCoords;
    var mx = x0 + 12, pitch = 182 / n, cwid = pitch - 1.2, my = 219;
    txt(mk, mx, 213.5, 'support mask', 'tm navy2', FS.lab);
    for (var i = 0; i < n; i++) {
      var state = 'off';
      if (i === 0) state = 'on';
      else if (i <= K) {
        var ch = i - 1;
        if (ch < LIVE_CHANNELS) state = SETTLED[ch] ? 'on' : 'zero';
      } else if (i <= K + M) {
        var co = i - K - 1;
        if (co < LIVE_CONTROLS) state = SETTLED[LIVE_CHANNELS + co] ? 'on' : 'zero';
      }
      var cx = mx + i * pitch + 0.6;
      el('rect', { x: n2(cx), y: my, width: n2(cwid), height: 10, rx: 1, 'class': state === 'on' ? 'mcell' : (state === 'zero' ? 'mcell-zero' : 'mcell-off') }, mk);
      if (state === 'zero') txt(mk, cx + cwid / 2, my + 7.3, '0', 'tm navy', 5.8, 'middle');
    }
    var spans = [[0, 0, '1'], [1, K, 'K = ' + K], [K + 1, K + M, 'M = ' + M], [K + M + 1, n - 1, String(n - 1 - K - M)]];
    spans.forEach(function (s) {
      var a = mx + s[0] * pitch + 0.6, z = mx + (s[1] + 1) * pitch - 0.6;
      el('path', { d: 'M' + n2(a) + ' 232.5V234.5H' + n2(z) + 'V232.5', 'class': 'navy-line' }, mk);
      txt(mk, (a + z) / 2, 243.5, s[2], 'tm navy', FS.lab, 'middle');
    });
  }

  // Decomposition d: one draw of baseline, channels and controls over the weeks.
  function buildOutput() {
    var b = B.out, x0 = b.x;
    var wrap = fgroup(L.blocks, null);
    blockRect(piece(wrap, { from: 6, order: 1 }), b);
    var ov = piece(wrap, { from: 6, lod: 'ov', order: 2 });
    txt(ov, x0 + 12, 100, 'Decomposition d', 'tt', FS.title);
    txt(ov, x0 + 12, 238, 'baseline · channels · controls', 'ts', FS.sub);
    var hd = piece(wrap, { from: 6, lod: 'dt', order: 2, textAt: [6] });
    txt(hd, x0 + 12, 93, 'DECOMPOSITION d · ONE DRAW', 'th', FS.hdr);
    txt(hd, x0 + 220, 93, 'illustrative', 'th', FS.hdr, 'end');

    var bx = x0 + 12, bw = 208, by = 203, bh = 90, n = 80;
    var comp = [[], [], [], [], [], []];   // baseline, TV, Search, Social, Promo, Holiday
    for (var i = 0; i < n; i++) {
      var u = i / (n - 1);
      comp[0].push(0.34 + 0.05 * Math.sin(2 * Math.PI * (u * 2 + 0.1)) + 0.012 * Math.sin(2 * Math.PI * u * 9));
      comp[1].push(0.03 + 0.15 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (u * 4.2 + 0.1)), 2));
      comp[2].push(0.09 + 0.035 * Math.sin(2 * Math.PI * (u * 3 + 0.4)));
      comp[3].push(SETTLED[2] ? 0.06 : 0);
      comp[4].push(0.015 + 0.08 * Math.exp(-Math.pow((u - 0.3) / 0.035, 2)) + 0.07 * Math.exp(-Math.pow((u - 0.66) / 0.03, 2)) + 0.05 * Math.exp(-Math.pow((u - 0.86) / 0.03, 2)));
      comp[5].push(0.01 + 0.12 * Math.exp(-Math.pow((u - 0.47) / 0.05, 2)) + 0.1 * Math.exp(-Math.pow((u - 0.97) / 0.05, 2)));
    }
    var cum = [], acc = comp[0].map(function () { return 0; }), maxT = 0;
    cum.push(acc.slice());
    comp.forEach(function (cs) { acc = acc.map(function (v, j) { return v + cs[j]; }); cum.push(acc.slice()); });
    acc.forEach(function (v) { maxT = Math.max(maxT, v); });
    function pts(level) { return level.map(function (v, j) { return [bx + bw * j / (n - 1), by - v / maxT * bh]; }); }
    var colors = ['rgba(243,246,251,.2)', INPUTS[0].color, INPUTS[1].color, INPUTS[2].color, INPUTS[3].color, INPUTS[4].color];

    var bands = piece(wrap, { from: 6, order: 3 });
    var clip = el('clipPath', { id: 'arch-bandclip' }, defs);
    refs.bandClip = el('rect', { x: bx - 4, y: by - bh - 8, width: bw + 8, height: bh + 12 }, clip);
    bandW = bw + 8;
    var gb = el('g', { 'clip-path': 'url(#arch-bandclip)' }, bands);
    for (var k = 0; k < comp.length; k++) {
      if (SETTLED[k - 1] === 0) continue;   // an absent edge contributes exactly zero
      var lo = pts(cum[k]), hi = pts(cum[k + 1]);
      var rev = lo.slice().reverse();
      el('path', {
        d: 'M' + n2(hi[0][0]) + ' ' + n2(hi[0][1]) + curveThrough(hi) + 'L' + n2(rev[0][0]) + ' ' + n2(rev[0][1]) + curveThrough(rev) + 'Z',
        fill: colors[k], 'class': 'band'
      }, gb);
    }
    el('path', { d: 'M' + bx + ' ' + (by + 0.6) + 'H' + (bx + bw), 'class': 'axis' }, bands);

    var lg = piece(wrap, { from: 6, lod: 'dt', order: 4, textAt: [6] });
    var names = ['Baseline', 'TV', 'Search', 'Social', 'Promo', 'Holiday'];
    names.forEach(function (name, k) {
      var x = bx + (k % 3) * 72, y = 222 + Math.floor(k / 3) * 13;
      var zero = k > 0 && SETTLED[k - 1] === 0;
      el('rect', { x: x + 0.3, y: y - 4.7, width: 5, height: 5, rx: 1, fill: zero ? 'none' : colors[k], 'class': zero ? 'swatch-zero' : null }, lg);
      txt(lg, x + 9, y, zero ? name + ' · 0' : name, 'tm' + (zero ? ' dimtext' : ''), FS.lab);
    });
  }

  // Connectors of the main row, the h bypass and the flow-input feed.
  function buildLinks() {
    var g1 = fgroup(L.links, dimAfter(1));
    connector(g1, 'M206 ' + CY + 'H251', { from: 1, order: 1, head: [251, CY, 1, 0], glow: true });

    var g2 = fgroup(L.links, dimAfter(2));
    connector(g2, 'M458 ' + CY + 'H503', { from: 2, order: 1, head: [503, CY, 1, 0], glow: true });
    txt(piece(g2, { from: 2, lod: 'ov', order: 2 }), 481, CY - 9, 'h', 'tm', FS.mono, 'middle');
    txt(piece(g2, { from: 2, lod: 'dt', order: 2, textAt: [2] }), 481, CY - 4.5, 'h', 'tm aquat', FS.tag, 'middle');

    var g3 = fgroup(L.links, dimAfter(3));
    connector(g3, 'M710 ' + CY + 'H752', { from: 3, order: 1, tone: 'p', dash: 'dot', head: [752, CY, 1, 0], glow: true });
    txt(piece(g3, { from: 3, lod: 'dt', order: 2, textAt: [3] }), 731, CY - 5, 'sampled G', 'tm peacht', 5.8, 'middle');

    var g4 = fgroup(L.links, dimAfter(3));
    refs.discard = connector(g4, 'M710 113H733', { from: 3, order: 2, dash: 'dot' });
    xMark(piece(g4, { from: 3, order: 4 }), 738.5, 113, 2.4);
    txt(piece(g4, { from: 3, lod: 'dt', order: 5, textAt: [3] }), 712, 104.5, 'discarded', 'tm dimtext', 5.8);

    var g5 = fgroup(L.links, dimAfter(4));
    connector(g5, 'M896 ' + CY + 'H938', { from: 4, order: 1, tone: 'p', head: [938, CY, 1, 0], glow: true });

    var g6 = fgroup(L.links, dimAfter(4));
    connector(g6, 'M355 76V60Q355 52 363 52H1035Q1043 52 1043 60V75', { from: 4, order: 0, head: [1043, 75, 0, 1], glow: true });
    txt(piece(g6, { from: 4, lod: 'ov', order: 2 }), 699, 42, 'h · shared representations', 'tm', FS.mono, 'middle');
    txt(piece(g6, { from: 4, lod: 'dt', order: 2, textAt: [4] }), 1048, 69, 'h', 'tm aquat', FS.tag);

    var g7 = fgroup(L.links, dimAfter(5));
    connector(g7, 'M1146 ' + CY + 'H1190', { from: 5, order: 1, head: [1190, CY, 1, 0], glow: true });

    var g8 = fgroup(L.links, null);
    connector(g8, 'M1398 ' + CY + 'H1442', { from: 6, order: 0, head: [1442, CY, 1, 0], glow: true });

    // Flow inputs enter both heads from below.
    var gfr = fgroup(L.links, dimAfter(2));
    connector(gfr, 'M860 312V306Q860 300 854 300H673Q667 300 667 294V268', { from: 2, order: 4, tone: 'f', head: [667, 268, 0, -1] });
    var lab = piece(gfr, { from: 2, lod: 'ov', order: 5 });
    txt(lab, 860, 327, 'flow inputs', 'tl', FS.sub, 'middle');
    txt(lab, 860, 345, 'state · flow time · coherent noise', 'tm dimtext', FS.mono, 'middle');
    var gfd = fgroup(L.links, dimAfter(5));
    connector(gfd, 'M860 312V306Q860 300 866 300H1229Q1235 300 1235 294V268', { from: 5, order: 4, tone: 'f', head: [1235, 268, 0, -1] });
  }

  function tbox(parent, x, y, w, title, sub, order) {
    var g = piece(parent, { from: 7, order: order });
    el('rect', { x: x, y: y, width: w, height: 60, rx: 7, 'class': 'blk tbox' }, g);
    txt(g, x + 14, y + 25, title, 'tl', 16);
    txt(g, x + 14, y + 46, sub, 'tm perit', FS.mono);
  }

  // Training: simulation targets, the dashed target bus and the losses.
  function buildTraining() {
    var wrap = fgroup(L.train, function (s) { return s === 8 ? 'dim25' : ''; });
    txt(piece(wrap, { from: 7, order: 0 }), 0, 391, 'TRAINING ONLY', 'tcap', FS.mono);
    tbox(wrap, 0, 444, 206, 'Simulation targets', 'true G · true d', 1);
    tbox(wrap, 240, 356, 230, 'Auxiliary edge classifier', 'never selects graphs', 3);
    tbox(wrap, 240, 444, 230, 'Edge cross-entropy', 'structure loss', 5);
    tbox(wrap, 492, 356, 230, 'Joint velocity loss', 'targets: d and G', 6);
    tbox(wrap, 1180, 356, 230, 'Conditional velocity loss', 'd given the true G', 8);
    connector(wrap, 'M355 266V354', { from: 7, order: 2, head: [355, 354, 0, 1] });
    connector(wrap, 'M355 416V442', { from: 7, order: 4, head: [355, 442, 0, 1] });
    connector(wrap, 'M587 266V354', { from: 7, order: 5, head: [587, 354, 0, 1] });
    connector(wrap, 'M1275 266V354', { from: 7, order: 7, head: [1275, 354, 0, 1] });
    connector(wrap, 'M103 504V526Q103 532 109 532H1289Q1295 532 1295 526V418', { from: 7, order: 2, tone: 'v', dash: 'dash', head: [1295, 418, 0, -1] });
    connector(wrap, 'M355 532V506', { from: 7, order: 5, tone: 'v', dash: 'dash', head: [355, 506, 0, -1] });
    connector(wrap, 'M607 532V418', { from: 7, order: 6, tone: 'v', dash: 'dash', head: [607, 418, 0, -1] });
    connector(wrap, 'M1080 532V268', { from: 7, order: 7, tone: 'v', dash: 'dash', head: [1080, 268, 0, -1] });
    txt(piece(wrap, { from: 7, order: 8 }), 1068, 476, 'true G · training only', 'tm perit', FS.mono, 'end');
    var fp = piece(wrap, { from: 7, order: 9, cls: 'nofx' });
    var fo = el('foreignObject', { x: 300, y: 540, width: 1080, height: 84 }, fp);
    var div = document.createElement('div');
    div.className = 'arch-tex';
    div.innerHTML = Deck.tex(LOSS_TEX, false);
    fo.appendChild(div);
  }

  // Step tags (zoomed views), the inference counter and the full-view footnote.
  function buildNotes() {
    var N = L.notes;
    var n0 = piece(N, { only: [0], order: 6 });
    var t1 = txt(n0, 248, 162, 'true graph · true contributions', 'tl dimtext', 6.6);
    el('path', { d: 'M245 159.7H' + n2(251 + t1.getComputedTextLength()), 'class': 'strike' }, n0);
    xMark(n0, 250, 172.8, 2, 'p');
    txt(n0, 256, 175, 'never enters the encoder', 'tm peacht', FS.lab);

    tags(N, 470, 164, [
      NET.encoderBlocks + ' blocks · ' + NET.heads + ' heads per block · ' + NET.headWidth + ' dimensions per head',
      fmtInt(NET.params) + ' parameters in the full network'
    ], { only: [1], order: 9 });
    tags(N, 776, 158, [
      ['z', ['1'], ' = (d', ['t'], ', 2G − 1)'],
      NET.routerCoordsPerWeek + ' coordinates / week',
      'velocity nets: baseline · entity · fixed · edge'
    ], { only: [2], order: 6 });
    tags(N, 962, 160, ['edge ⇔ mean signed state', 'over query weeks > 0', 'illustrative draws'], { only: [3], order: 8, peach: true, dimLast: true });
    tags(N, 1200, 164, [
      NET.graphSlots + ' graph slots · ' + NET.graphFamilies + ' families',
      NET.graphSlotsUsed + ' direct slots used · ' + NET.graphSlotsZero + ' zero in River’s prior',
      'messages only on sampled edges',
      'illustrative draw'
    ], { only: [4], order: 6, dimLast: true });
    tags(N, 1464, 164, [
      NET.decoderCoords + ' coordinates = 1 + K + M + 4',
      'absent edge → exactly 0',
      'illustrative draw'
    ], { only: [5], order: 6, dimLast: true });

    var cnt = piece(N, { only: [8], order: 20 });
    refs.counter = txt(cnt, 1676, 318, 'draw 1 / ' + NET.draws, 'tm aquat', 20, 'end');
    txt(cnt, 1676, 340, 'weights fixed · ' + NET.eulerSteps + ' Euler steps', 'tm', FS.mono, 'end');
    // The full view shows the illustrative grid, graph draws and bands too.
    txt(piece(N, { only: [7, 8], order: 21 }), 1676, 628, 'grid, graph draws, decomposition: illustrative', 'tm dimtext', FS.mono, 'end');
  }

  // Particle routes, sampled once at uniform arc length.
  function route(id, d, o) {
    var p = el('path', { d: d }, defs);
    var len = p.getTotalLength();
    var nS = Math.max(8, Math.ceil(len / 1.5));
    var tbl = new Float32Array((nS + 1) * 2);
    for (var i = 0; i <= nS; i++) {
      var q = p.getPointAtLength(len * i / nS);
      tbl[2 * i] = q.x;
      tbl[2 * i + 1] = q.y;
    }
    defs.removeChild(p);
    var R = rng(len * 7 + o.n);
    // speed: stage px per second on screen, whatever the zoom
    var r = { id: id, tbl: tbl, nS: nS, len: len, n: o.n, speed: 70, alpha: 0, target: 0, phase: R(), nodes: [], lat: [], op: [], jit: [], hidden: true };
    for (i = 0; i < o.n; i++) {
      r.nodes.push(el('circle', { 'class': 'pt' + (o.tone ? ' ' + o.tone : ''), cx: -99, cy: -99, opacity: 0 }, L.parts));
      r.lat.push((R() - 0.5) * (o.spread === undefined ? 6 : o.spread));
      r.op.push(0.55 + 0.45 * R());
      r.jit.push(R());
    }
    routes.push(r);
  }
  function buildRoutes() {
    route('in', 'M186 ' + CY + 'H268', { n: 7 });
    route('h', 'M444 ' + CY + 'H520', { n: 7 });
    route('sg', 'M700 ' + CY + 'H760', { n: 6, tone: 'p', spread: 3 });
    route('gc', 'M887 ' + CY + 'H954', { n: 6, tone: 'p', spread: 3 });
    route('by', 'M355 84V60Q355 52 363 52H1035Q1043 52 1043 60V88', { n: 34, spread: 4 });
    route('cd', 'M1134 ' + CY + 'H1206', { n: 7 });
    route('do', 'M1386 ' + CY + 'H1460', { n: 7 });
    route('finr', 'M860 314V306Q860 300 854 300H673Q667 300 667 294V256', { n: 10, tone: 'f', spread: 3 });
    route('find', 'M860 314V306Q860 300 866 300H1229Q1235 300 1235 294V256', { n: 16, tone: 'f', spread: 3 });
    route('tbus', 'M103 506V526Q103 532 109 532H1289Q1295 532 1295 526V420', { n: 44, tone: 'v', spread: 3 });
    route('tce', 'M355 532V506', { n: 3, tone: 'v', spread: 2 });
    route('tjl', 'M607 532V420', { n: 5, tone: 'v', spread: 2 });
    route('ttg', 'M1080 532V270', { n: 10, tone: 'v', spread: 2 });
  }

  function build(rootEl) {
    svg = el('svg', {
      'class': 'arch-svg', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet',
      role: 'img', 'aria-label': 'River architecture: shared encoder, joint router, sampled graph, graph conditioner, conditional decoder'
    });
    buildDefs();
    var world = el('g', null, svg);
    L.train = el('g', null, world);
    L.links = el('g', null, world);
    L.blocks = el('g', null, world);
    L.notes = el('g', null, world);
    L.parts = el('g', null, world);
    rootEl.appendChild(svg);
    buildInputs();
    buildEncoder();
    buildRouter();
    buildGraph();
    buildConditioner();
    buildDecoder();
    buildOutput();
    buildLinks();
    buildTraining();
    buildNotes();
    buildRoutes();
  }

  /* ---- Camera ----------------------------------------------------------------------- */
  function camBox(s) { return { x: CAMS[s][0], y: CAMS[s][1], w: CAMS[s][2] }; }
  function setView(b) {
    cam = b;
    svg.setAttribute('viewBox', n2(b.x) + ' ' + n2(b.y) + ' ' + n2(b.w) + ' ' + n2(b.w * HF));
    var k = Math.round(b.w / W * 10000) / 10000;
    if (k !== lastK) { svg.style.setProperty('--k', String(k)); lastK = k; }
  }
  // Zooms run about the fixed point of the two boxes; pans between zoomed boxes
  // pull back a little in the middle (more for longer jumps).
  function moveCamera(to, dur) {
    var f = cam;
    if (dur <= 0) { camAnim = null; setView(to); return; }
    var a = { from: f, to: to, t0: performance.now(), dur: dur };
    var ratio = Math.max(f.w, to.w) / Math.min(f.w, to.w);
    if (ratio > 1.4) {
      a.mode = 'zoom';
      a.px = (to.x * f.w - f.x * to.w) / (f.w - to.w);
      a.py = (to.y * f.w - f.y * to.w) / (f.w - to.w);
    } else {
      a.mode = 'pan';
      a.fc = [f.x + f.w / 2, f.y + f.w * HF / 2];
      a.tc = [to.x + to.w / 2, to.y + to.w * HF / 2];
      var dist = Math.hypot(a.tc[0] - a.fc[0], a.tc[1] - a.fc[1]), wa = (f.w + to.w) / 2;
      a.hop = dist < 0.12 * wa ? 0 : clamp((dist + 0.5 * wa) / wa - 1, 0.16, 2.2);
    }
    camAnim = a;
  }
  function camDuration(to) {
    var ratio = Math.max(cam.w, to.w) / Math.min(cam.w, to.w);
    if (ratio > 1.4) return 1600;
    var dist = Math.hypot(to.x + to.w / 2 - cam.x - cam.w / 2, (to.y + to.w * HF / 2) - (cam.y + cam.w * HF / 2));
    return dist > 700 ? 1800 : 1450;
  }
  function updateCamera(now) {
    var a = camAnim;
    if (!a) return;
    var p = clamp((now - a.t0) / a.dur, 0, 1), e = ease.inOutQuint(p), b;
    if (a.mode === 'zoom') {
      var sc = Math.pow(a.to.w / a.from.w, e);
      b = { x: a.px + (a.from.x - a.px) * sc, y: a.py + (a.from.y - a.py) * sc, w: a.from.w * sc };
    } else {
      var w = lerp(a.from.w, a.to.w, e) * (1 + a.hop * Math.sin(Math.PI * e));
      b = { x: lerp(a.fc[0], a.tc[0], e) - w / 2, y: lerp(a.fc[1], a.tc[1], e) - w * HF / 2, w: w };
    }
    setView(b);
    if (p >= 1) camAnim = null;
  }

  /* ---- Step state --------------------------------------------------------------------- */
  function flush() { return svg.getBoundingClientRect(); }

  function applyState(s, o) {
    var k = CAMS[s][2] / W;
    svg.style.setProperty('--ty', n2(22 * k) + 'px');
    svg.style.setProperty('--bl', n2(6 * k) + 'px');
    var lodSwitch = o.prev !== undefined && ((o.prev >= FULL) !== (s >= FULL));
    var showing = [];
    pieces.forEach(function (p) {
      var v = shownAt(p, s);
      if (v && !p.on) showing.push(p);
      else if (!v && p.on) {
        p.node.style.setProperty('--d', '0ms');
        p.node.classList.remove('on');
        p.on = false;
      }
      if (p.glow) p.node.classList.toggle('glow', s === 8);
      if (p.textAt) p.node.classList.toggle('quiet', p.textAt.indexOf(s) === -1);
    });
    showing.sort(function (a, b) { return a.order - b.order; });
    var base = o.enter ? 260 : (lodSwitch ? 700 : 420);
    var st = showing.length > 1 ? Math.min(70, 900 / (showing.length - 1)) : 0;
    showing.forEach(function (p, i) {
      p.node.style.setProperty('--d', Math.round(base + i * st) + 'ms');
      p.node.classList.add('on');
      p.on = true;
    });
    groups.forEach(function (g) {
      var c = g.fn(s);
      if (c === g.cls) return;
      if (g.cls) g.node.classList.remove(g.cls);
      if (c) g.node.classList.add(c);
      g.cls = c;
    });
    var fl = FLOW[s];
    routes.forEach(function (r) { r.target = fl[r.id] || 0; });
  }

  function resetHidden() {
    svg.classList.add('instant');
    pieces.forEach(function (p) { p.on = false; p.node.classList.remove('on', 'glow', 'faded'); });
    groups.forEach(function (g) { if (g.cls) g.node.classList.remove(g.cls); g.cls = ''; });
    discardFaded = false;
    flush();
    svg.classList.remove('instant');
  }

  function setBands(s, prev, now) {
    if (s === 6 && (prev === undefined || prev < 6) && !reduced) {
      refs.bandClip.setAttribute('width', 0);
      bandAnim = { t0: now + 560 };
    } else {
      bandAnim = null;
      refs.bandClip.setAttribute('width', n2(bandW));
    }
  }

  /* ---- Animation loop ------------------------------------------------------------------- */
  function updateStreams(t) {
    for (var i = 0; i < streams.length; i++) {
      if (streams[i].host.__piece.on) drawStream(streams[i], t);
    }
  }

  function updateRoutes(dt) {
    var k = cam.w / W;
    for (var j = 0; j < routes.length; j++) {
      var r = routes[j];
      r.alpha += (r.target - r.alpha) * Math.min(1, dt * 3.2);
      if (r.alpha < 0.004 || reduced) {
        if (!r.hidden) { for (var h = 0; h < r.n; h++) r.nodes[h].setAttribute('opacity', 0); r.hidden = true; }
        continue;
      }
      r.hidden = false;
      r.phase = (r.phase + dt * r.speed * k / r.len) % 1;
      for (var i = 0; i < r.n; i++) {
        var s = (r.phase + (i + r.jit[i] * 0.6) / r.n) % 1;
        var f = s * r.nS, i0 = Math.min(r.nS - 1, Math.floor(f)), fr = f - i0;
        var x0 = r.tbl[2 * i0], y0 = r.tbl[2 * i0 + 1], x1 = r.tbl[2 * i0 + 2], y1 = r.tbl[2 * i0 + 3];
        var dx = x1 - x0, dy = y1 - y0, dl = Math.hypot(dx, dy) || 1, off = r.lat[i] * k;
        var nd = r.nodes[i];
        nd.setAttribute('cx', (x0 + dx * fr - dy / dl * off).toFixed(2));
        nd.setAttribute('cy', (y0 + dy * fr + dx / dl * off).toFixed(2));
        nd.setAttribute('opacity', (r.alpha * r.op[i] * smooth(0, 0.12, s) * (1 - smooth(0.86, 1, s))).toFixed(3));
      }
    }
  }

  function updateMessages(now) {
    var vis = refs.condGraph.__piece.on && !reduced;
    if (!vis) {
      if (msgShown) {
        msgs.forEach(function (m) { m.node.setAttribute('opacity', 0); });
        pulses.forEach(function (q) { q.node.setAttribute('opacity', 0); });
        msgShown = false;
      }
      return;
    }
    msgShown = true;
    var p = ((now - stepT0) % 2800) / 2800;
    var tr = clamp((p - 0.12) / 0.42, 0, 1), e = ease.inOut(tr);
    msgs.forEach(function (m) {
      var q = quadAt(m.q, e);
      m.node.setAttribute('cx', q[0].toFixed(2));
      m.node.setAttribute('cy', q[1].toFixed(2));
      m.node.setAttribute('opacity', tr > 0 && tr < 1 ? Math.sqrt(Math.sin(Math.PI * tr)).toFixed(3) : 0);
    });
    var pp = clamp((p - 0.54) / 0.3, 0, 1);
    pulses.forEach(function (q) {
      q.node.setAttribute('r', n2(q.r0 + 7 * ease.out(pp)));
      q.node.setAttribute('opacity', pp > 0 && pp < 1 ? ((1 - pp) * 0.9).toFixed(3) : 0);
    });
  }

  function showGraph(g) {
    var key = g.join('');
    if (key === graphKey) return;
    graphKey = key;
    gEdges.forEach(function (e, i) { e.classList.toggle('e-on', !!g[i]); });
  }
  function drawGraph(seed) {
    var R = rng(seed * 2654435761);
    return P_EDGE.map(function (p) { return R() < p ? 1 : 0; });
  }
  function setCounter(v) {
    if (v === counterVal) return;
    counterVal = v;
    refs.counter.textContent = 'draw ' + v + ' / ' + NET.draws;
  }
  function updateGraphDraws(now) {
    if (step === 3 && !reduced) {
      var t = now - stepT0 - 900;
      var last = FLICKER_T[FLICKER_T.length - 1] + 240;
      if (t < 0) showGraph(FLICKER[0]);
      else if (t >= last) showGraph(SETTLED);
      else {
        var i = 0;
        while (i < FLICKER_T.length - 1 && t >= FLICKER_T[i + 1]) i++;
        showGraph(FLICKER[i]);
      }
    } else if (step === 8 && !reduced) {
      var cyc = NET.draws + 14;
      var j = Math.floor(Math.max(0, now - stepT0 - 700) / DRAW_MS) % cyc;
      if (j < NET.draws) { showGraph(drawGraph(j + 1)); setCounter(j + 1); }
      else { showGraph(SETTLED); setCounter(NET.draws); }
    } else {
      showGraph(SETTLED);
      if (step === 8) setCounter(NET.draws);
    }
  }

  function updateBands(now) {
    if (!bandAnim) return;
    var p = clamp((now - bandAnim.t0) / 1300, 0, 1);
    refs.bandClip.setAttribute('width', n2(bandW * ease.inOut(p)));
    if (p >= 1) bandAnim = null;
  }

  function updateDiscard(now) {
    var want = step > 3 || (step === 3 && (reduced || now - stepT0 > 2400));
    if (want === discardFaded) return;
    discardFaded = want;
    refs.discard.classList.toggle('faded', want);
  }

  // Under reduced motion nothing moves once a step has settled, so the loop stops
  // requesting frames until the next step, enter or resize.
  function frame(now) {
    raf = 0;
    if (!active) return;
    var dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 1 / 60;
    lastNow = now;
    updateCamera(now);
    updateStreams(reduced ? 0 : now / 1000);
    updateRoutes(dt);
    updateMessages(now);
    updateGraphDraws(now);
    updateBands(now);
    updateDiscard(now);
    if (reduced && !camAnim && !bandAnim && now - stepT0 > SETTLE_MS) { lastNow = 0; return; }
    raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (active && !raf) raf = requestAnimationFrame(frame);
  }

  /* ---- Scene contract ------------------------------------------------------------------- */
  Deck.registerScene('arch', {
    mount: function (section) {
      build(section.querySelector('.scene-root'));
      setView(camBox(0));
    },

    enter: function (ctx) {
      reduced = !!Deck.reducedMotion;
      svg.classList.toggle('reduced', reduced);
      step = clampStep(ctx.step);
      var now = performance.now();
      stepT0 = now;
      resetHidden();
      routes.forEach(function (r) { r.alpha = 0; });
      var to = camBox(step);
      if (ctx.instant || reduced) moveCamera(to, 0);
      else {
        setView({ x: to.x - to.w * 0.035, y: to.y - to.w * HF * 0.035, w: to.w * 1.07 });
        moveCamera(to, 1500);
      }
      if (ctx.instant) svg.classList.add('instant');
      applyState(step, { enter: true });
      if (ctx.instant) { flush(); svg.classList.remove('instant'); }
      setBands(step, undefined, now);
      graphKey = '';
      counterVal = -1;
      active = true;
      lastNow = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    },

    step: function (ctx) {
      var prev = step;
      step = clampStep(ctx.step);
      var now = performance.now();
      stepT0 = now;
      if (ctx.instant) svg.classList.add('instant');
      applyState(step, { prev: prev });
      var to = camBox(step);
      moveCamera(to, ctx.instant || reduced ? 0 : camDuration(to));
      if (ctx.instant) { flush(); svg.classList.remove('instant'); }
      setBands(step, prev, now);
      kick();
    },

    leave: function () {
      active = false;
      cancelAnimationFrame(raf);
      raf = 0;
      camAnim = null;
      bandAnim = null;
    },

    resize: function () { kick(); }
  });
})();
