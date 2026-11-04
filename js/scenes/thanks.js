/* ==========================================================================
   Scene "thanks" (closing slide, dark theme): "Thank you" as a graph that
   morphs through four languages: English, Finnish, Spanish, Portuguese.

   Each word is drawn once off screen in Archivo Expanded. Its outline pixels
   give N evenly spread nodes (farthest-point sampling); each node links to its
   nearest neighbours, so the edges trace the letters. All words share the same
   N nodes, matched left to right, so a morph moves every node from its place
   in one word to its place in the next. The edges of the old word stretch and
   fade while the edges of the new word draw in. One peach node travels
   through every word.
   Reduced motion: the words cross-fade in place.
   ========================================================================== */
(function () {
  'use strict';

  var W = 1920, H = 1080;
  var WORDS = ['Thank you', 'Kiitos', 'Gracias', 'Obrigado'];   // English, Finnish, Spanish, Portuguese
  var FONT_PX = 230;
  var N = 440;                 // nodes per word
  var K = 2;                   // nearest neighbours per node
  var LINK_MAX = 2.6;          // longest edge, in median nearest-neighbour spacings
  var HOLD_MS = 2400;          // a word stays still
  var MORPH_MS = 1800;         // then flows into the next
  var WAVE = 0.38;             // share of the morph over which the left-to-right wave starts
  var ENTER_MS = 1600;         // first assembly from a scatter
  var PEACH = 0;               // index (after the left-to-right sort) of the travelling peach node

  var COL = {
    edge: 'rgba(180, 231, 221, ',      // aqua, alpha appended
    node: '#B4E7DD',
    peri: '#9FAAE2',
    peach: '#F6AE72'
  };

  /* ---- Small maths ----------------------------------------------------------- */
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function easeInOut(t) { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- One word as a graph --------------------------------------------------- */
  function setFont(c) {
    c.font = '400 ' + FONT_PX + 'px Archivo, "Helvetica Neue", Arial, sans-serif';
    if ('fontStretch' in c) c.fontStretch = 'expanded';   // Archivo Expanded, as in the deck's headings
  }

  // Outline pixels of the word, drawn centred on the stage.
  function outline(word) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d', { willReadFrequently: true });
    setFont(c);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    var m = c.measureText(word);
    var asc = m.actualBoundingBoxAscent || FONT_PX * 0.72;
    var desc = m.actualBoundingBoxDescent || FONT_PX * 0.2;
    c.fillStyle = '#fff';
    c.fillText(word, W / 2, H / 2 + (asc - desc) / 2);
    var px = c.getImageData(0, 0, W, H).data;
    var pts = [];
    function on(x, y) { return px[(y * W + x) * 4 + 3] > 127; }
    for (var y = 1; y < H - 1; y++) {
      for (var x = 1; x < W - 1; x++) {
        if (!on(x, y)) continue;
        if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) pts.push(x, y);
      }
    }
    return pts;
  }

  // N evenly spread nodes on the outline (farthest-point sampling), sorted left to right.
  function sample(pts, R) {
    var m = pts.length / 2;
    var d = new Float32Array(m).fill(Infinity);
    var out = [];
    var cur = Math.floor(R() * m);
    for (var n = 0; n < N; n++) {
      var cx = pts[cur * 2], cy = pts[cur * 2 + 1];
      out.push({ x: cx, y: cy });
      var best = -1, bi = 0;
      for (var i = 0; i < m; i++) {
        var dx = pts[i * 2] - cx, dy = pts[i * 2 + 1] - cy;
        var dd = dx * dx + dy * dy;
        if (dd < d[i]) d[i] = dd;
        if (d[i] > best) { best = d[i]; bi = i; }
      }
      cur = bi;
    }
    out.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    return out;
  }

  // Each node links to its K nearest neighbours that are close enough: the edges trace the glyphs.
  function link(nodes) {
    var nn = [], i, j;
    var near = nodes.map(function (a, ia) {
      var list = [];
      for (j = 0; j < nodes.length; j++) {
        if (j === ia) continue;
        var dx = nodes[j].x - a.x, dy = nodes[j].y - a.y;
        list.push({ j: j, d: Math.sqrt(dx * dx + dy * dy) });
      }
      list.sort(function (p, q) { return p.d - q.d; });
      nn.push(list[0].d);
      return list.slice(0, K);
    });
    var sorted = nn.slice().sort(function (p, q) { return p - q; });
    var limit = LINK_MAX * sorted[Math.floor(sorted.length / 2)];
    var seen = {}, edges = [];
    for (i = 0; i < near.length; i++) {
      for (var k = 0; k < near[i].length; k++) {
        var e = near[i][k];
        if (e.d > limit) continue;
        var a = Math.min(i, e.j), b = Math.max(i, e.j), key = a * 4096 + b;
        if (seen[key]) continue;
        seen[key] = true;
        edges.push(a, b);
      }
    }
    return edges;
  }

  function buildWords() {
    return WORDS.map(function (w, wi) {
      var nodes = sample(outline(w), rng(17 + wi * 101));
      var minX = Infinity, maxX = -Infinity;
      nodes.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); });
      return { word: w, nodes: nodes, edges: link(nodes), minX: minX, span: Math.max(1, maxX - minX) };
    });
  }

  /* ---- Scene ----------------------------------------------------------------- */
  var root, canvas, ctx, k = 1;
  var words = null;
  var nodeStyle = [];          // per node index: radius and colour (fixed across words)
  var flight = [];             // per node index: arc height and phase for the morph and the idle drift
  var X = new Float32Array(N), Y = new Float32Array(N), U = new Float32Array(N);
  var raf = 0, t0 = 0, active = false, reduced = false;

  function fit() {
    var s = Deck.scale() * Math.min(window.devicePixelRatio || 1, 2);
    var bw = Math.max(1, Math.round(W * s)), bh = Math.max(1, Math.round(H * s));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    k = bw / W;
  }

  function ensureWords() {
    if (words) return;
    words = buildWords();
    var R = rng(5);
    for (var i = 0; i < N; i++) {
      var peri = R() < 0.06;
      nodeStyle.push({ r: peri ? 3.4 : 2.4, fill: peri ? COL.peri : COL.node });
      flight.push({ arc: (R() - 0.5) * 120, ph: R() * Math.PI * 2, sx: R() * W, sy: R() * H });
    }
  }

  function drawEdges(word, alphaOf) {
    var e = word.edges;
    ctx.lineWidth = 1.2;
    for (var i = 0; i < e.length; i += 2) {
      var a = e[i], b = e[i + 1];
      var al = alphaOf(a, b);
      if (al <= 0.01) continue;
      ctx.strokeStyle = COL.edge + (0.42 * al).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(X[a], Y[a]);
      ctx.lineTo(X[b], Y[b]);
      ctx.stroke();
    }
  }

  function drawNodes(alpha) {
    for (var i = 0; i < N; i++) {
      var st = nodeStyle[i];
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === PEACH ? COL.peach : st.fill;
      ctx.beginPath();
      ctx.arc(X[i], Y[i], i === PEACH ? 6 : st.r, 0, Math.PI * 2);
      ctx.fill();
      if (i === PEACH) {
        ctx.globalAlpha = alpha * 0.25;
        ctx.beginPath();
        ctx.arc(X[i], Y[i], 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!active) return;
    var t = Math.max(0, now - t0);   // the first frame's time can be a little before enter()
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';

    var cycle = HOLD_MS + MORPH_MS;
    var i, A, B, s, wi;

    if (reduced) {
      // Cross-fade the four graphs in place; nothing travels.
      wi = Math.floor(t / cycle) % words.length;
      s = smooth(((t % cycle) - HOLD_MS) / MORPH_MS);
      [[words[wi], 1 - s], [words[(wi + 1) % words.length], s]].forEach(function (p) {
        if (p[1] <= 0.01) return;
        for (i = 0; i < N; i++) { X[i] = p[0].nodes[i].x; Y[i] = p[0].nodes[i].y; }
        drawEdges(p[0], function () { return p[1]; });
        drawNodes(p[1]);
      });
      raf = requestAnimationFrame(frame);
      return;
    }

    if (t < ENTER_MS) {
      // Entrance: the nodes gather from a scatter into the first word, left first.
      A = words[0];
      for (i = 0; i < N; i++) {
        var f = flight[i], n = A.nodes[i];
        var d = WAVE * (n.x - A.minX) / A.span;
        U[i] = easeInOut((t / ENTER_MS - d) / (1 - WAVE));
        X[i] = lerp(lerp(W / 2, f.sx, 0.55), n.x, U[i]);
        Y[i] = lerp(lerp(H / 2, f.sy, 0.55), n.y, U[i]);
      }
      drawEdges(A, function (a, b) { return Math.min(U[a], U[b]); });
      drawNodes(smooth(t / 500));
    } else {
      var tc = t - ENTER_MS;
      wi = Math.floor(tc / cycle) % words.length;
      A = words[wi];
      B = words[(wi + 1) % words.length];
      var p = tc % cycle;
      s = p < HOLD_MS ? 0 : (p - HOLD_MS) / MORPH_MS;
      var drift = now / 1000;
      for (i = 0; i < N; i++) {
        var fl = flight[i], a = A.nodes[i], b = B.nodes[i];
        var delay = WAVE * (a.x - A.minX) / A.span;
        var u = easeInOut((s - delay) / (1 - WAVE));
        U[i] = u;
        // Nodes rise or dip on the way, so the morph flows instead of sliding flat.
        var lift = Math.sin(Math.PI * u) * fl.arc;
        var still = 1.1 * Math.sin(drift * 1.3 + fl.ph);
        X[i] = lerp(a.x, b.x, u) + still;
        Y[i] = lerp(a.y, b.y, u) + lift + still * 0.7;
      }
      drawEdges(A, function (ia, ib) { return (1 - U[ia]) * (1 - U[ib]); });
      drawEdges(B, function (ia, ib) { return U[ia] * U[ib]; });
      drawNodes(1);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  Deck.registerScene('thanks', {
    mount: function (section) {
      root = section.querySelector('.scene-root');
      var wrap = document.createElement('div');
      wrap.className = 'mx mx-thanks';
      canvas = document.createElement('canvas');
      canvas.className = 'mx-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      wrap.appendChild(canvas);
      root.appendChild(wrap);
      ctx = canvas.getContext('2d');
      fit();
      // Sampling the four words takes a moment: do it now, off the slide's entrance.
      setTimeout(ensureWords, 400);
    },
    enter: function (ctx0) {
      ensureWords();
      reduced = !!Deck.reducedMotion;
      active = true;
      fit();
      // An instant entry (reload, overview jump) starts at the first word, already assembled.
      t0 = performance.now() - (ctx0.instant ? ENTER_MS : 0);
      start();
    },
    step: function () {},
    leave: function () {
      active = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    resize: function () { if (canvas) fit(); }
  });
})();
