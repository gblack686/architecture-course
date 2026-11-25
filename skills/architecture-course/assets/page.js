/* Course page: outline, lesson header, stage, timeline, step card. Needs engine.js (window.ArchStage). */
(function () {
  'use strict';
  var KIND = { req: 'request', ok: 'reply or pass', bad: 'refused or failed', sync: 'background' };
  var NOTE = { idea: ['Key idea', '!'], tip: ['Tip', '+'], warn: ['Watch out', '!'], next: ['Up next', '>'] };
  var OP = { add: ['+', 'Added: '], mod: ['~', 'Changed: '], del: ['-', 'Removed: '] };
  function $(id) { return document.getElementById(id); }
  function h(tag, cls, text, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function list(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }

  function Course(data) {
    var me = this, key = 'arch-course:' + data.id;
    me.data = data; me.app = $('app');
    me.lessons = [];
    data.chapters.forEach(function (c, ci) {
      c.scene.tracks.forEach(function (t, li) { me.lessons.push({ chapter: c, ci: ci, li: li, scene: c.scene, t: t, n: t.steps.length }); });
    });
    me.save = { seen: {}, theme: null };
    try { Object.assign(me.save, JSON.parse(localStorage.getItem(key) || '{}')); } catch (e) { /* private window: nothing is kept */ }
    me.store = function () { try { localStorage.setItem(key, JSON.stringify(me.save)); } catch (e) { /* nothing is kept */ } };
    me.lesson = -1; me.step = -1;
    me.buildOutline(); me.wire();
    window.addEventListener('hashchange', function () { me.route(); });
    me.route();
  }

  Course.prototype.route = function () {
    var me = this, m = /^#\/([^/]+)(?:\/(\d+))?/.exec(location.hash), i = -1;
    if (m) me.lessons.forEach(function (l, k) { if (l.t.id === m[1]) i = k; });
    if (i < 0) { me.open(0, 0, true); return; }
    me.open(i, Math.max(0, Math.min(me.lessons[i].n - 1, (+m[2] || 1) - 1)), true);
  };

  Course.prototype.open = function (i, s, fromHash) {
    var me = this, l = me.lessons[i], fresh = i !== me.lesson;
    if (!fresh && s === me.step) return;
    var before = fresh ? null : me.cur();
    me.lesson = i; me.step = s;
    if (fresh) {
      if (!me.stage || me.stage.scene !== l.scene) {
        if (me.stage) me.stage.destroy();
        me.makeStage(l.scene);
      }
      me.drawHead(l);
    }
    var seen = me.save.seen[l.t.id] || (me.save.seen[l.t.id] = []);
    if (seen.indexOf(s) < 0) seen.push(s);
    me.store();
    me.drawStep(l, before); me.drawOutline();
    me.stage.fit(); me.stage.show(me.cur());
    var hash = '#/' + l.t.id + '/' + (s + 1);
    if (location.hash !== hash) {
      if (fromHash) history.replaceState(null, '', hash); else history.pushState(null, '', hash);
    }
    document.title = l.t.label + ' - ' + me.data.title;
  };
  Course.prototype.makeStage = function (scene) {
    this.stage = new window.ArchStage($('canvas'), scene, { onPause: function (p) { $('pause').textContent = p ? 'Play' : 'Pause'; } });
    $('pause').textContent = this.stage.paused ? 'Play' : 'Pause';
  };
  Course.prototype.cur = function () { return this.lessons[this.lesson].t.steps[this.step]; };
  Course.prototype.done = function (l) { return (this.save.seen[l.t.id] || []).length >= l.n; };
  Course.prototype.go = function (d) {
    var l = this.lessons[this.lesson], s = this.step + d;
    if (s >= 0 && s < l.n) this.open(this.lesson, s);
    else if (s >= l.n && this.lesson < this.lessons.length - 1) this.open(this.lesson + 1, 0);
    else if (s < 0 && this.lesson > 0) this.open(this.lesson - 1, this.lessons[this.lesson - 1].n - 1);
  };

  Course.prototype.buildOutline = function () {
    var me = this, tree = $('tree');
    $('count').textContent = me.lessons.length + (me.lessons.length === 1 ? ' lesson' : ' lessons');
    me.chaps = me.data.chapters.map(function (c, ci) {
      var box = h('section', 'chap', null, tree), b = h('button', '', null, box), ul = h('ul', '', null, box);
      b.type = 'button'; h('span', 'chev', null, b);
      h('i', '', null, b).style.background = 'var(--' + (c.tone || 'terracotta') + '1)';
      h('span', '', String(ci + 1).padStart(2, '0') + '. ' + c.title, b);
      var n = h('small', '', '', b);
      b.addEventListener('click', function () { box.toggleAttribute('data-open'); b.setAttribute('aria-expanded', String(box.hasAttribute('data-open'))); });
      return { box: box, b: b, n: n, ul: ul };
    });
    me.lessons.forEach(function (l, i) {
      var b = h('button', '', null, h('li', '', null, me.chaps[l.ci].ul)); b.type = 'button';
      l.tick = h('span', 'tick', null, b); h('span', '', l.t.label, b); l.b = b;
      b.addEventListener('click', function () { me.open(i, 0); me.menu(false); });
    });
  };
  Course.prototype.drawOutline = function () {
    var me = this, done = 0;
    me.lessons.forEach(function (l, i) {
      var d = me.done(l); if (d) done++;
      l.tick.toggleAttribute('data-on', d);
      l.b.setAttribute('aria-label', l.t.label + (d ? ', completed' : ''));
      if (i === me.lesson) l.b.setAttribute('aria-current', 'page'); else l.b.removeAttribute('aria-current');
    });
    me.chaps.forEach(function (c, ci) {
      var own = me.lessons.filter(function (l) { return l.ci === ci; });
      c.n.textContent = own.filter(function (l) { return me.done(l); }).length + '/' + own.length;
      if (ci === me.lessons[me.lesson].ci) c.box.setAttribute('data-open', '');
      c.b.setAttribute('aria-expanded', String(c.box.hasAttribute('data-open')));
    });
    $('pct').textContent = done + ' / ' + me.lessons.length;
    $('fill').style.width = done / me.lessons.length * 100 + '%';
  };

  Course.prototype.drawHead = function (l) {
    var me = this, own = me.lessons.filter(function (x) { return x.ci === l.ci; });
    $('crumb').textContent = String(l.ci + 1).padStart(2, '0') + '. ' + l.chapter.title + '  /  Lesson ' + (l.li + 1) + ' of ' + own.length;
    $('title').textContent = l.t.label; $('sub').textContent = l.t.subtitle || '';
    $('tags').textContent = '';
    list(l.t.tags).concat([l.n + (l.n === 1 ? ' step' : ' steps')]).forEach(function (x) { h('span', 'tag', x, $('tags')); });
    var kinds = [];
    l.t.steps.forEach(function (s) { (s.hops || []).forEach(function (p) { var k = p.kind || 'req'; if (kinds.indexOf(k) < 0) kinds.push(k); }); });
    $('legend').textContent = '';
    Object.keys(KIND).forEach(function (k) { if (kinds.indexOf(k) >= 0) { var s = h('span', '', null, $('legend')); h('i', 'k-' + k, null, s); s.appendChild(document.createTextNode((me.data.kinds || {})[k] || KIND[k])); } });
    $('chips').textContent = '';
    me.chips = (l.t.metrics || []).map(function (m) { var c = h('div', 'chip', null, $('chips')); h('small', '', m.label, c); return { id: m.id, box: c, b: h('b', '', '', c), v: null }; });
    var track = $('track'); track.textContent = ''; track.style.setProperty('--n', l.n);
    l.dots = l.t.steps.map(function (s, k) {
      var b = h('button', '', null, h('li', '', null, track)); b.type = 'button'; b.setAttribute('aria-label', 'Step ' + (k + 1) + ': ' + s.short);
      h('span', 'dot', String(k + 1), b); h('span', 'name', s.short, b);
      b.addEventListener('click', function () { me.open(me.lesson, k); });
      return b;
    });
    $('goals').hidden = !list(l.t.learn).length;
    $('goal-list').textContent = '';
    l.goals = list(l.t.learn).map(function (g) { var li = h('li', '', null, $('goal-list')); var t = h('span', 'tick', null, li); h('span', '', g.text, li); return { g: g, li: li, t: t }; });
  };

  Course.prototype.drawStep = function (l, before) {
    var me = this, s = me.cur(), seen = me.save.seen[l.t.id];
    $('stepno').textContent = 'Step ' + (me.step + 1) + ' of ' + l.n;
    $('tl-count').textContent = 'Step ' + (me.step + 1) + ' of ' + l.n;
    $('phase').hidden = !s.phase; $('phase').textContent = s.phase || ''; $('phase').dataset.kind = (s.phase || '').toLowerCase();
    $('step-title').textContent = s.title;
    $('text').textContent = ''; list(s.body).forEach(function (p) { h('p', '', p, $('text')); });
    var n = s.idea; $('note').hidden = !n;
    if (n) { var k = NOTE[n.kind] || NOTE.idea; $('note').dataset.kind = n.kind; $('note-i').textContent = k[1]; $('note-b').textContent = k[0]; $('note-p').textContent = n.text; }
    $('changes').hidden = !list(s.changes).length; $('change-list').textContent = '';
    list(s.changes).forEach(function (c) { var li = h('li', '', null, $('change-list')), o = OP[c.op] || OP.mod; li.dataset.op = c.op; var i = h('i', '', o[0], li); i.setAttribute('role', 'img'); i.setAttribute('aria-label', o[1]); h('span', '', c.text, li); });
    $('src-list').textContent = ''; $('src').hidden = !list(s.sources).length;
    list(s.sources).forEach(function (x) { h('li', '', (x.repo === me.data.home_repo ? '' : x.repo + ': ') + x.path + ':' + x.line, $('src-list')); });
    (me.chips || []).forEach(function (c) {
      var v = (s.metrics || {})[c.id], o = v && typeof v === 'object' ? v : { v: v }, txt = o.v == null ? 'none yet' : String(o.v), was = c.v;
      c.b.textContent = txt; c.box.dataset.tone = o.tone || ''; c.v = txt;
      c.box.removeAttribute('data-new');
      if (before && was !== null && was !== txt) { void c.box.offsetWidth; c.box.setAttribute('data-new', ''); }
    });
    l.dots.forEach(function (b, k) {
      b.toggleAttribute('data-seen', seen.indexOf(k) >= 0);
      if (k === me.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    var track = $('track'), d = l.dots[me.step];
    track.style.setProperty('--done', l.n > 1 ? me.step / (l.n - 1) : 1);
    track.scrollLeft = d.parentNode.offsetLeft - (track.clientWidth - d.offsetWidth) / 2;
    l.goals.forEach(function (x) { var on = seen.indexOf((x.g.step || 1) - 1) >= 0; x.li.toggleAttribute('data-on', on); x.t.toggleAttribute('data-on', on); });
    var last = me.step === l.n - 1, nl = me.lessons[me.lesson + 1];
    $('back').disabled = me.step === 0 && me.lesson === 0;
    $('next').disabled = last && !nl;
    $('next-label').textContent = !last ? 'Next: ' + l.t.steps[me.step + 1].short : nl ? 'Next lesson: ' + nl.t.label : 'End of course';
    var rail = document.querySelector('.rail'); if (rail) rail.scrollTop = 0;
  };

  Course.prototype.menu = function (on) {
    this.app.toggleAttribute('data-menu', on); $('shade').hidden = !on; $('menu').setAttribute('aria-expanded', String(on));
    if (on) $('tree').querySelector('[aria-current]').focus();
  };
  Course.prototype.full = function (on) {
    this.app.toggleAttribute('data-full', on); $('full').textContent = on ? 'Exit full screen' : 'Full screen';
    this.stage.fit();
  };
  Course.prototype.theme = function (t) {
    document.documentElement.dataset.theme = t; $('theme').textContent = t === 'dark' ? 'Light' : 'Dark';
    $('theme').setAttribute('aria-label', 'Switch to ' + (t === 'dark' ? 'light' : 'dark') + ' theme');
  };
  Course.prototype.search = function (q) {
    var me = this, box = $('hits'), words = q.toLowerCase().split(/\s+/).filter(Boolean);
    box.textContent = ''; box.hidden = !words.length;
    if (!words.length) return;
    var found = [];
    me.lessons.forEach(function (l, i) {
      l.t.steps.forEach(function (s, k) {
        var hay = [l.t.label, s.short, s.title].concat(list(s.body)).join(' ').toLowerCase();
        if (words.every(function (w) { return hay.indexOf(w) >= 0; })) found.push([i, k, s, l, words.every(function (w) { return s.title.toLowerCase().indexOf(w) >= 0; }) ? 0 : 1]);
      });
    });
    found.sort(function (a, b) { return a[4] - b[4]; });
    found.slice(0, 12).forEach(function (f) {
      var b = h('button', '', f[2].title, box); b.type = 'button';
      h('small', '', f[3].t.label + ', step ' + (f[1] + 1), b);
      b.addEventListener('click', function () { me.open(f[0], f[1]); me.closeSearch(); });
    });
    if (!found.length) h('p', '', 'No step matches "' + q + '".', box);
  };
  Course.prototype.closeSearch = function () { $('q').value = ''; $('hits').hidden = true; this.app.removeAttribute('data-find'); };

  Course.prototype.wire = function () {
    var me = this;
    $('back').onclick = function () { me.go(-1); }; $('next').onclick = function () { me.go(1); };
    $('replay').onclick = function () { me.stage.replay(); };
    $('pause').onclick = function () { me.stage.setPaused(!me.stage.paused); };
    $('full').onclick = $('canvas').onclick = function () { me.full(!me.app.hasAttribute('data-full')); };
    $('menu').onclick = function () { me.menu(!me.app.hasAttribute('data-menu')); };
    $('shade').onclick = function () { me.menu(false); };
    $('theme').onclick = function () { var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; me.theme(t); me.save.theme = t; me.store(); };
    $('about-btn').onclick = function () { $('about').showModal(); };
    $('about-close').onclick = function () { $('about').close(); };
    $('find-btn').onclick = function () { me.app.toggleAttribute('data-find'); if (me.app.hasAttribute('data-find')) $('q').focus(); };
    $('q').oninput = function () { me.search(this.value); };
    $('q').onkeydown = function (e) {
      var first = $('hits').querySelector('button');
      if (e.key === 'Enter' && first) first.click();
      else if (e.key === 'ArrowDown' && first) { e.preventDefault(); first.focus(); }
      else if (e.key === 'Escape') { me.closeSearch(); this.blur(); }
    };
    $('hits').onkeydown = function (e) {
      var a = document.activeElement, to = e.key === 'ArrowDown' ? a.nextElementSibling : e.key === 'ArrowUp' ? a.previousElementSibling || $('q') : null;
      if (to) { e.preventDefault(); e.stopPropagation(); to.focus(); }
      if (e.key === 'Escape') { me.closeSearch(); $('q').focus(); }
    };
    document.addEventListener('click', function (e) { if (!e.target.closest('.find') && !e.target.closest('#find-btn')) me.closeSearch(); });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); me.app.setAttribute('data-find', ''); $('q').focus(); return; }
      if (e.altKey || e.ctrlKey || e.metaKey || $('about').open) return;
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); me.go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); me.go(-1); }
      else if (e.key === 'Escape') { if (me.app.hasAttribute('data-menu')) { me.menu(false); $('menu').focus(); } else me.full(false); }
      else if (e.key === ' ' && tag !== 'button' && tag !== 'summary') { e.preventDefault(); me.stage.setPaused(!me.stage.paused); }
      else if (e.key === 'r' || e.key === 'R') me.stage.replay();
      else if (e.key === 'f' || e.key === 'F') me.full(!me.app.hasAttribute('data-full'));
    });
    me.theme(me.save.theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  };

  window.ArchCourse = { start: function (data) { return new Course(data); } };
})();
