/* Architecture diagram stage. Plain SVG, no dependencies.
   One scene (gbauto.arch-scene.v1) drawn once, then moved from step to step.
   Every frame is computed from (step, clock), so pause, replay and tests are exact.
   No DOM nodes are added or removed per frame. Colours are CSS variables, so a theme switch needs no redraw. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', U = 64, C = Math.cos(Math.PI / 6), HALF = 0.8, LEAD = 0.75, HOLD = 1.1;
  var HEIGHT = { block: 0.9, disk: 0.85, slab: 0.3 }, ROUND = { block: 0.27, slab: 0.34 };
  var TONES = ['terracotta', 'amber', 'red', 'blue', 'green', 'stone'];
  var KIND = { req: 1, ok: 1, bad: 1, sync: 1 };
  var ICON = {
    phone: 'M-5-9h10v18h-10zM-1.5 6h3', chat: 'M-9-7h18v11h-11l-5 4v-4h-2z', shield: 'M0-9l8 3v6q0 6-8 9q-8-3-8-9v-6z',
    plug: 'M-4-9v5M4-9v5M-7-4h14v3q0 6-7 6t-7-6zM0 5v5', send: 'M-9-1l18-8-6 18-4-7zM9-9l-10 11', inbox: 'M-9 1l4-8h10l4 8v7h-18zM-9 1h5l2 3h4l2-3h5',
    file: 'M-6-9h8l4 4v14h-12zM-3-1h6M-3 3h6', search: 'M4-2a6 6 0 1 1-12 0a6 6 0 1 1 12 0M3 3l6 6', check: 'M-8 0l5 6l11-12',
    branch: 'M-5-9v18M-5 5q10 0 10-10M5-9v4', spark: 'M0-9v18M-9 0h18M-6-6l12 12M6-6l-12 12', compass: 'M9 0a9 9 0 1 1-18 0a9 9 0 1 1 18 0M4-4l-2 6-6 2 2-6z'
  };

  /* Isometric projection: grid (x, y) on the floor, z up. */
  function P(x, y, z) { return [(x - y) * C * U, (x + y) * 0.5 * U - (z || 0) * U]; }
  function flat(o, k) { return 'matrix(' + [C * k, 0.5 * k, -C * k, 0.5 * k, o[0], o[1]].map(function (v) { return v.toFixed(3); }).join(' ') + ')'; }
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    set(n, attrs || {});
    if (parent) parent.appendChild(n);
    return n;
  }
  function set(n, a) { for (var k in a) n.setAttribute(k, a[k]); }
  function poly(pts) { return 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L') + 'Z'; }
  /* A rounded rectangle on the grid, projected. cut is the corner radius in grid units. */
  function rounded(x0, y0, x1, y1, cut, z) {
    var out = [], n = 10, c = Math.min(cut, (x1 - x0) / 2, (y1 - y0) / 2);
    [[x1 - c, y0 + c, -1], [x1 - c, y1 - c, 0], [x0 + c, y1 - c, 1], [x0 + c, y0 + c, 2]].forEach(function (k) {
      for (var i = 0; i <= n; i++) { var a = (k[2] + i / n) * Math.PI / 2; out.push(P(k[0] + c * Math.cos(a), k[1] + c * Math.sin(a), z)); }
    });
    return out;
  }
  function pad(x, y, r, cut, z) { return rounded(x - r, y - r, x + r, y + r, cut, z); }
  /* Convex outline of a point cloud: the silhouette of a rounded prism from its top and bottom faces. */
  function hull(pts) {
    var p = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function half(list) {
      var h = [];
      list.forEach(function (q) {
        while (h.length > 1) {
          var a = h[h.length - 2], b = h[h.length - 1];
          if ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) > 0) break;
          h.pop();
        }
        h.push(q);
      });
      return h.slice(0, -1);
    }
    return half(p).concat(half(p.reverse()));
  }
  /* Replace each bend in a route with a short curve, as points, so packets follow it too. */
  function smooth(grid, cut) {
    var out = [grid[0]];
    for (var i = 1; i < grid.length - 1; i++) {
      var a = grid[i - 1], b = grid[i], c = grid[i + 1], la = Math.hypot(b[0] - a[0], b[1] - a[1]), lc = Math.hypot(c[0] - b[0], c[1] - b[1]), d = Math.min(cut, la / 2, lc / 2);
      var s = [b[0] + (a[0] - b[0]) / la * d, b[1] + (a[1] - b[1]) / la * d], e = [b[0] + (c[0] - b[0]) / lc * d, b[1] + (c[1] - b[1]) / lc * d];
      for (var k = 0; k <= 8; k++) { var t = k / 8, u = 1 - t; out.push([u * u * s[0] + 2 * u * t * b[0] + t * t * e[0], u * u * s[1] + 2 * u * t * b[1] + t * t * e[1]]); }
    }
    return out.concat([grid[grid.length - 1]]);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function labelScale(k) { return clamp(0.78 / k, 1, 2.6); }
  function textWidth(t, per) {
    var w = 0;
    try { w = t.getComputedTextLength(); } catch (e) { w = 0; }
    return w || t.textContent.length * per;
  }
  function along(e, u) {
    var want = e.len * clamp(u, 0, 1);
    for (var i = 0; i < e.seg.length; i++) {
      if (want <= e.seg[i] || i === e.seg.length - 1) {
        var t = e.seg[i] ? want / e.seg[i] : 0;
        return [lerp(e.pts[i][0], e.pts[i + 1][0], t), lerp(e.pts[i][1], e.pts[i + 1][1], t)];
      }
      want -= e.seg[i];
    }
  }

  function Stage(box, scene, opts) {
    var me = this;
    me.box = box; me.scene = scene; me.clock = 0; me.from = null; me.step = null; me.plan = [];
    me.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    me.paused = me.reduced; me.onPause = (opts || {}).onPause || function () {};
    me.nodes = {}; me.edges = {};
    box.textContent = '';
    me.svg = el('svg', { role: 'img' }, box);
    me.buildWorld();
    if (window.ResizeObserver) { me.watch = new ResizeObserver(function () { me.fit(); }); me.watch.observe(box); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { me.fit(); });
    var last = performance.now();
    (function tick(now) {
      if (me.dead) return;
      var dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      if (!me.paused && !document.hidden && me.step) { me.clock += dt; me.draw(); }
      requestAnimationFrame(tick);
    })(last);
  }
  Stage.prototype.destroy = function () { this.dead = true; if (this.watch) this.watch.disconnect(); this.box.textContent = ''; };
  Stage.prototype.setPaused = function (p) { this.paused = p; this.onPause(p); if (this.step) this.draw(); };
  Stage.prototype.replay = function () { this.clock = LEAD; this.setPaused(false); };

  Stage.prototype.buildWorld = function () {
    var me = this, s = me.scene, defs = el('defs', {}, me.svg);
    Object.keys(KIND).forEach(function (k) {
      var m = el('marker', { id: 'am-' + s.id + '-' + k, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 17, markerHeight: 17, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M1.2 1.2L8.6 5L1.2 8.8Z', 'class': 'k-' + k + ' s-' + k, 'stroke-width': 2, 'stroke-linejoin': 'round' }, m);
    });
    /* Shading: lit top, lit left side, darker right side, with a soft front edge instead of a hard one. */
    TONES.forEach(function (t) {
      grad('top', t, 0, 0, 1, 1, [[0, 'lit'], [0.55, 0], [1, 0]]);
      grad('side', t, 0, 0, 1, 0, [[0, 1], [0.4, 1], [0.5, 'edge'], [0.6, 2], [1, 2]]);
      grad('tube', t, 0, 0, 1, 0, [[0, 2], [0.3, 1], [0.42, 'edge'], [0.6, 1], [1, 2]]);
    });
    function grad(kind, t, x1, y1, x2, y2, stops) {
      var g = el('linearGradient', { id: 'am-' + s.id + '-' + kind + '-' + t, x1: x1, y1: y1, x2: x2, y2: y2 }, defs);
      stops.forEach(function (k) { el('stop', { offset: k[0], style: 'stop-color:var(--' + t + (k[1] === 'edge' ? '1h' : k[1] === 'lit' ? '0h' : k[1]) + ')' }, g); });
    }
    var glow = el('radialGradient', { id: 'am-' + s.id + '-shade' }, defs);
    el('stop', { offset: 0.35, style: 'stop-color:#000;stop-opacity:.22' }, glow); el('stop', { offset: 1, style: 'stop-color:#000;stop-opacity:0' }, glow);
    me.world = el('g', {}, me.svg);
    var gZone = el('g', {}, me.world), gEdge = el('g', {}, me.world), gNode = el('g', {}, me.world), gLabel = el('g', {}, me.world), gPacket = el('g', {}, me.world);
    s.zones.forEach(function (z) {
      var a = z.x[0], b = z.x[1], c = z.y[0], d = z.y[1];
      var deck = rounded(a, c, b, d, 0.75);
      el('path', { d: poly(hull(deck.concat(rounded(a, c, b, d, 0.75, -0.16)))), 'class': 'am-zone-side' }, gZone);
      el('path', { d: poly(deck), 'class': 'am-zone' }, gZone);
      el('text', { transform: flat(P(a + 0.85, c + 0.72), 1), 'class': 'am-zone-title' }, gZone).textContent = z.title;
    });
    s.nodes.slice().sort(function (a, b) { return a.x + a.y - b.x - b.y; }).forEach(function (n) {
      var g = el('g', { 'data-node': n.id }, gNode), tone = n.tone || 'stone', fill = function (k) { return 'url(#am-' + s.id + '-' + k + '-' + tone + ')'; }, cut = ROUND[n.shape] || 0.27, H = HEIGHT[n.shape] || 0.8, x = n.x, y = n.y, r = HALF;
      el('ellipse', { cx: P(x, y)[0], cy: P(x, y)[1] + 10, rx: r * U * 1.75, ry: r * U * 1.02, fill: 'url(#am-' + s.id + '-shade)' }, g);
      var ring = el('path', { d: poly(pad(x, y, 1.15, 0.45)), 'class': 'am-ring', opacity: 0 }, g), lift = el('g', {}, g);
      var low = r * U;
      if (n.shape === 'disk') {
        var c0 = P(x, y), rx = r * U * 1.16, ry = rx * 0.577, top = c0[1] - H * U;
        el('path', { d: 'M' + (c0[0] - rx) + ' ' + top + 'V' + c0[1] + 'A' + rx + ' ' + ry + ' 0 0 0 ' + (c0[0] + rx) + ' ' + c0[1] + 'V' + top + 'Z', fill: fill('tube'), 'class': 'am-face' }, lift);
        el('ellipse', { cx: c0[0], cy: top, rx: rx, ry: ry, fill: fill('top'), 'class': 'am-face' }, lift);
        el('path', { d: 'M' + (c0[0] - rx + 4) + ' ' + (top + 5) + 'A' + (rx - 3) + ' ' + (ry - 1) + ' 0 0 0 ' + (c0[0] + rx - 4) + ' ' + (top + 5), 'class': 'am-bevel' }, lift);
      } else {
        var lid = pad(x, y, r, cut, H);
        el('path', { d: poly(hull(lid.concat(pad(x, y, r, cut)))), fill: fill('side'), 'class': 'am-face' }, lift);
        el('path', { d: poly(lid), fill: fill('top'), 'class': 'am-top' }, lift);
        /* Front rim: a bright line just under the top face, from its left tip to its right tip. */
        var rim = pad(x, y, r, cut, H - 0.045).slice(5, 28);
        el('path', { d: 'M' + rim.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('L'), 'class': 'am-bevel' }, lift);
        el('path', { d: poly(hull(lid.concat(pad(x, y, r, cut)))), 'class': 'am-face am-line' }, lift);
      }
      el('path', { d: ICON[n.icon] || ICON.file, transform: 'translate(' + P(x, y, H).map(function (v) { return v.toFixed(1); }).join(' ') + ') scale(3 1.85)', 'class': 'am-icon', 'vector-effect': 'non-scaling-stroke' }, lift);
      var lab = el('g', { 'class': 'am-label' }, gLabel), box = el('rect', { rx: 14 }, lab);
      var t1 = el('text', { 'text-anchor': 'middle', y: 18, 'class': 'am-l1' }, lab), t2 = el('text', { 'text-anchor': 'middle', y: 34, 'class': 'am-l2' }, lab);
      var tag = el('g', { 'class': 'am-tag', opacity: 0 }, gLabel), tbox = el('rect', { rx: 12, height: 24, y: -12 }, tag), tt = el('text', { 'text-anchor': 'middle', y: 4.5 }, tag);
      me.nodes[n.id] = { d: n, H: H, g: g, lift: lift, ring: ring, lab: lab, box: box, t1: t1, t2: t2, tag: tag, tbox: tbox, tt: tt, on: 1, up: 0, low: low };
    });
    s.edges.forEach(function (e) {
      var A = me.nodes[e.from].d, B = me.nodes[e.to].d;
      var grid = (e.pts || [[A.x, A.y]].concat(e.via || [], [[B.x, B.y]])).map(function (p) { return p.slice(); });
      trim(grid, 0, 1); trim(grid, grid.length - 1, grid.length - 2);
      var pts = smooth(grid, 0.7).map(function (p) { return P(p[0], p[1]); }), seg = [], len = 0;
      var d = 'M' + pts.map(function (p) { return p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('L');
      for (var i = 1; i < pts.length; i++) { var l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); len += l; }
      el('path', { d: d, 'class': 'am-edge-base' }, gEdge);
      me.edges[e.id] = { d: e, pts: pts, seg: seg, len: len, v: 0, path: el('path', { d: d, 'class': 'am-edge', pathLength: 1, 'stroke-dasharray': '1 1', 'data-edge': e.id }, gEdge) };
    });
    function trim(g, i, j) {
      var dx = g[j][0] - g[i][0], dy = g[j][1] - g[i][1], l = Math.hypot(dx, dy), cut = 1.05;
      g[i][0] += dx / l * cut; g[i][1] += dy / l * cut;
    }
    var most = Math.max.apply(null, s.tracks.map(function (t) { return Math.max.apply(null, t.steps.map(function (x) { return (x.hops || []).length; })); }));
    me.pool = [];
    for (var i = 0; i < most; i++) {
      var pk = el('g', { 'class': 'am-packet', opacity: 0 }, gPacket), dot = el('circle', { r: 9 }, pk);
      var cross = el('path', { d: 'M-9-9L9 9M9-9L-9 9', 'class': 'am-cross', opacity: 0 }, pk), pl = el('g', {}, pk);
      me.pool.push({ g: pk, dot: dot, cross: cross, pl: pl, pb: el('rect', { rx: 11, height: 22, y: -37 }, pl), pt: el('text', { 'text-anchor': 'middle', y: -21.5 }, pl) });
    }
  };

  Stage.prototype.measure = function () {
    var me = this;
    Object.keys(me.nodes).forEach(function (id) {
      var n = me.nodes[id], w = Math.max(textWidth(n.t1, 8.6), me.compact ? 0 : textWidth(n.t2, 6.9)) + 26, t = textWidth(n.tt, 7.4) + 20;
      n.w = w;
      set(n.box, { x: -w / 2, width: w, height: n.t2.textContent && !me.compact ? 43 : 27 });
      n.t2.setAttribute('display', me.compact ? 'none' : 'inline');
      set(n.tbox, { x: -t / 2, width: t });
    });
    me.pool.forEach(function (p) { var w = textWidth(p.pt, 7.4) + 16; set(p.pb, { x: -w / 2, width: w }); });
  };

  Stage.prototype.show = function (s) {
    var me = this, t = LEAD;
    me.step = s;
    me.from = { n: {}, e: {}, cam: me.cam };
    Object.keys(me.nodes).forEach(function (id) { me.from.n[id] = { on: me.nodes[id].on, up: me.nodes[id].up }; });
    Object.keys(me.edges).forEach(function (id) { me.from.e[id] = me.edges[id].v; });
    me.clock = 0;
    me.plan = (s.hops || []).map(function (hop) {
      var e = me.edges[hop.e], a = t, b = t + clamp(e.len / 300, 0.65, 1.7);
      t = b + (hop.fail ? HOLD : 0.22);
      return { hop: hop, e: e, a: a, b: b };
    });
    me.loop = t + HOLD;
    me.focus = !s.focus || s.focus === 'all' ? Object.keys(me.nodes) : s.focus;
    me.lit = {}; me.focus.forEach(function (id) { me.lit[id] = 1; });
    me.hot = {};
    me.plan.forEach(function (p) {
      var x = me.hot[p.hop.e] || (me.hot[p.hop.e] = { f: 0, r: 0 });
      x.kind = x.kind || p.hop.kind || 'req'; x[p.hop.r ? 'r' : 'f'] = 1;
    });
    Object.keys(me.nodes).forEach(function (id) {
      var n = me.nodes[id], r = (s.relabel || {})[id] || {}, tag = (s.tags || {})[id];
      n.t1.textContent = r.label || n.d.label; n.t2.textContent = r.sub || n.d.sub || '';
      n.tagOn = !!tag;
      if (tag) { n.tt.textContent = tag.t; n.tag.setAttribute('class', 'am-tag c-' + (tag.tone || 'stone')); }
    });
    me.pool.forEach(function (p, i) {
      var pl = me.plan[i];
      p.pt.textContent = pl ? pl.hop.label || '' : '';
      p.pl.setAttribute('opacity', pl && pl.hop.label ? 1 : 0);
      if (pl) p.dot.setAttribute('class', 'k-' + (pl.hop.kind || 'req'));
    });
    me.svg.setAttribute('aria-label', s.title + '. ' + s.body);
    me.aim();
    me.draw();
  };

  /* Far out, a label keeps its name and drops the second line. */
  Stage.prototype.aim = function () {
    var me = this;
    me.compact = false; me.measure(); me.target = me.camera();
    if (me.target.k < 0.62) { me.compact = true; me.measure(); me.target = me.camera(); }
  };

  /* Frame the focused nodes. Labels stay readable on screen, so their world size depends on the zoom. */
  Stage.prototype.camera = function () {
    var me = this, W = me.W || 900, H = me.Hgt || 480, k = 1, b;
    for (var i = 0; i < 5; i++) {
      var ls = labelScale(k);
      b = [1e9, 1e9, -1e9, -1e9];
      me.focus.forEach(function (id) {
        var n = me.nodes[id], p = P(n.d.x, n.d.y), hw = Math.max(HALF * 2 * C * U, n.w / 2 * ls) + 10;
        b = [Math.min(b[0], p[0] - hw), Math.min(b[1], p[1] - n.H * U - HALF * U - (n.tagOn ? 26 * ls : 8)),
          Math.max(b[2], p[0] + hw), Math.max(b[3], p[1] + n.low + 10 + 46 * ls)];
      });
      if (me.focus.length === Object.keys(me.nodes).length) me.scene.zones.forEach(function (z) {
        b = [Math.min(b[0], P(z.x[0], z.y[1])[0]), Math.min(b[1], P(z.x[0], z.y[0])[1]), Math.max(b[2], P(z.x[1], z.y[0])[0]), Math.max(b[3], P(z.x[1], z.y[1], -0.14)[1])];
      });
      k = clamp(Math.min((W - 28) / (b[2] - b[0]), (H - 28) / (b[3] - b[1])), 0.12, 1.15);
    }
    /* On a small screen a wide step cannot be read whole, so the camera follows the packet instead. */
    if (W < 700 && k < 0.5 && me.plan.length) { var p = me.followAt(-1); return { k: 0.5, x: p[0], y: p[1], follow: true }; }
    return { k: k, x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 };
  };
  Stage.prototype.followAt = function (t) {
    var me = this, i, at = function (p, u) { return along(p.e, p.hop.r ? 1 - u : u); };
    var end = function (p) { return p.hop.fail ? 0.6 : 1; };
    if (t < me.plan[0].a) return at(me.plan[0], 0);
    for (i = 0; i < me.plan.length; i++) {
      var p = me.plan[i], next = me.plan[i + 1];
      if (t <= p.b) return at(p, ease((t - p.a) / (p.b - p.a)) * end(p));
      var stop = next ? next.a : me.loop;
      if (t <= stop) {
        var a = at(p, end(p)), b = next ? at(next, 0) : at(me.plan[0], 0), gap = Math.min(0.7, stop - p.b), u = ease(clamp((t - (stop - gap)) / gap, 0, 1));
        return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
      }
    }
    return at(me.plan[0], 0);
  };

  Stage.prototype.fit = function () {
    var me = this, r = me.box.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    me.W = r.width; me.Hgt = r.height;
    me.svg.setAttribute('viewBox', '0 0 ' + r.width.toFixed(0) + ' ' + r.height.toFixed(0));
    if (!me.step) return;
    me.aim(); me.from.cam = me.target;
    me.draw();
  };

  Stage.prototype.draw = function () {
    var me = this, f = me.from;
    if (!me.target) return;
    var still = me.paused && me.clock < LEAD;                  /* paused on arrival, or reduced motion: a settled picture */
    var q = still ? 1 : ease(clamp(me.clock / 0.7, 0, 1)), c0 = f.cam || me.target, c1 = me.target;
    var t = still || me.clock < LEAD ? -1 : (me.clock - LEAD) % (me.loop - LEAD) + LEAD, pulse = {};
    if (c1.follow) { var fp = me.followAt(t); c1 = { k: c1.k, x: fp[0], y: fp[1] }; }
    me.cam = { k: lerp(c0.k, c1.k, q), x: lerp(c0.x, c1.x, q), y: lerp(c0.y, c1.y, q) };
    var W = me.W || 900, H = me.Hgt || 480, k = me.cam.k, ls = labelScale(k);
    me.world.style.setProperty('--icon-w', (0.5 + 2.9 * k).toFixed(2) + 'px');   /* icon strokes do not scale by themselves */
    me.world.setAttribute('transform', 'translate(' + (W / 2 - me.cam.x * k).toFixed(2) + ' ' + (H / 2 - me.cam.y * k).toFixed(2) + ') scale(' + k.toFixed(4) + ')');
    me.plan.forEach(function (p) {
      var to = p.hop.r ? p.e.d.from : p.e.d.to;
      if (t >= p.b && t < p.b + 0.55 && !p.hop.fail) pulse[to] = Math.max(pulse[to] || 0, 1 - (t - p.b) / 0.55);
    });
    Object.keys(me.nodes).forEach(function (id) {
      var n = me.nodes[id], was = f.n[id], lit = !!me.lit[id], p = P(n.d.x, n.d.y);
      n.on = lerp(was.on, lit ? 1 : 0.22, q); n.up = lerp(was.up, n.tagOn ? 9 : 0, q);
      var up = n.up + (pulse[id] || 0) * 5;
      n.g.setAttribute('opacity', n.on.toFixed(3));
      n.lift.setAttribute('transform', 'translate(0 ' + (-up).toFixed(2) + ')');
      n.ring.setAttribute('opacity', (pulse[id] || 0).toFixed(2));
      n.lab.setAttribute('opacity', (lit ? n.on : Math.max(0, n.on - 0.22)).toFixed(3));
      n.lab.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + (p[1] + n.low + 8).toFixed(1) + ') scale(' + ls.toFixed(3) + ')');
      n.tag.setAttribute('opacity', n.tagOn ? q.toFixed(3) : 0);
      n.tag.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + (p[1] - (n.H + HALF) * U - up - 4).toFixed(1) + ') scale(' + ls.toFixed(3) + ')');
    });
    Object.keys(me.edges).forEach(function (id) {
      var e = me.edges[id], hot = me.hot[id];
      e.v = lerp(f.e[id], hot ? 1 : 0, q);
      if (hot) e.kind = hot.kind;
      var kind = e.kind || 'req', mark = 'url(#am-' + me.scene.id + '-' + kind + ')', done = hot && e.v > 0.96;
      set(e.path, { opacity: e.v > 0.01 ? 1 : 0, 'stroke-dashoffset': (1 - e.v).toFixed(3), 'class': 'am-edge s-' + kind,
        'marker-end': done && hot.f ? mark : 'none', 'marker-start': done && hot.r ? mark : 'none' });
    });
    me.pool.forEach(function (s, i) {
      var p = me.plan[i], o = 0, u = 0, x = 0;
      if (p && still) { o = 1; u = p.hop.r ? 0.3 : 0.5; x = p.hop.fail ? 1 : 0; }
      else if (p && t >= p.a) {
        var stop = p.hop.fail ? 0.6 : 1, raw = (t - p.a) / (p.b - p.a);
        if (raw <= 1) { o = 1; u = ease(clamp(raw, 0, 1)) * stop; }
        else if (p.hop.fail && t < p.b + HOLD) { o = 1; u = stop; x = 1; }
      }
      s.g.setAttribute('opacity', o);
      if (!o) return;
      var pos = along(p.e, p.hop.r ? 1 - u : u);
      s.g.setAttribute('transform', 'translate(' + pos[0].toFixed(1) + ' ' + pos[1].toFixed(1) + ') scale(' + ls.toFixed(3) + ')');
      s.cross.setAttribute('opacity', x); s.dot.setAttribute('opacity', x ? 0.35 : 1);
    });
  };

  window.ArchStage = Stage;
})();
