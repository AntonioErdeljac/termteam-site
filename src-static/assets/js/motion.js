// Recreates the Framer site's motion without the Framer runtime.
// Spring maths, in-view rules and transform strings follow framer-motion exactly.
(function () {
  "use strict";
  var spec = document.getElementById("fx-spec");
  spec = spec ? JSON.parse(spec.textContent) : {};
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var byId = {};
  document.querySelectorAll("[data-fx]").forEach(function (e) { byId[e.getAttribute("data-fx")] = e; });

  // ---- spring (framer-motion) -------------------------------------------
  function spring(from, to, o) {
    var k = o.stiffness == null ? 100 : o.stiffness, c = o.damping == null ? 10 : o.damping, m = o.mass == null ? 1 : o.mass;
    var z = c / (2 * Math.sqrt(k * m)), d = to - from, w = Math.sqrt(k / m) / 1000, gran = Math.abs(d) < 5;
    var restSpeed = o.restSpeed || (gran ? 0.01 : 2), restDelta = o.restDelta || (gran ? 0.005 : 0.5), f;
    if (z < 1) { var wd = w * Math.sqrt(1 - z * z); f = function (t) { var e = Math.exp(-z * w * t); return to - e * ((z * w * d) / wd * Math.sin(wd * t) + d * Math.cos(wd * t)); }; }
    else if (z === 1) f = function (t) { return to - Math.exp(-w * t) * (d + w * d * t); };
    else { var wo = w * Math.sqrt(z * z - 1); f = function (t) { var e = Math.exp(-z * w * t), r = Math.min(wo * t, 300); return to - (e * (z * w * d * Math.sinh(r) + wo * d * Math.cosh(r))) / wo; }; }
    return function (t) {
      var v = f(t), vel = 0;
      if (z < 1) { var p = Math.max(t - 5, 0); vel = t === 0 ? 0 : (v - f(p)) * (1000 / (t - p)); }
      var done = Math.abs(vel) <= restSpeed && Math.abs(to - v) <= restDelta;
      return done ? [to, true] : [v, false];
    };
  }
  function cubic(x1, y1, x2, y2) {
    function a(t, p1, p2) { return ((1 - 3 * p2 + 3 * p1) * t + (3 * p2 - 6 * p1)) * t * t + 3 * p1 * t; }
    return function (x) { if (x <= 0 || x >= 1) return x <= 0 ? 0 : 1; var lo = 0, hi = 1, t = x; for (var i = 0; i < 24; i++) { t = (lo + hi) / 2; if (a(t, x1, x2) < x) lo = t; else hi = t; } return a(t, y1, y2); };
  }
  function generator(from, to, tr) {
    if (tr && tr.type === "tween") {
      var dur = (tr.duration == null ? 0.3 : tr.duration) * 1000, e = tr.ease ? cubic.apply(null, tr.ease) : function (x) { return x; };
      return function (t) { if (t >= dur) return [to, true]; return [from + (to - from) * e(t / dur), false]; };
    }
    return spring(from, to, tr || {});
  }

  // ---- frame loop ---------------------------------------------------------
  var anims = [], dirty = new Set(), raf = 0;
  function tick(now) {
    raf = 0;
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      if (a.start == null) a.start = now;
      var t = Math.max(0, now - a.start - a.delay);
      var r = t === 0 && now - a.start < a.delay ? [a.from, false] : a.gen(t);
      a.state[a.key] = r[0]; dirty.add(a.el);
      if (r[1]) { anims.splice(i, 1); if (a.done) a.done(); }
    }
    dirty.forEach(render); dirty.clear();
    if (anims.length) raf = requestAnimationFrame(tick);
  }
  function animate(el, key, to, tr, delay, done) {
    var st = el.__fx || (el.__fx = {});
    for (var i = anims.length - 1; i >= 0; i--) if (anims[i].el === el && anims[i].key === key) anims.splice(i, 1);
    var from = st[key];
    if (from === to) { if (done) done(); return; }
    anims.push({ el: el, key: key, from: from, state: st, gen: generator(from, to, tr), delay: (delay || 0) * 1000, start: performance.now(), done: done });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  // ---- styles (framer-motion's buildTransform) -----------------------------
  var ORDER = ["transformPerspective", "x", "y", "z", "translateX", "translateY", "translateZ", "scale", "scaleX", "scaleY", "rotate", "rotateX", "rotateY", "rotateZ", "skew", "skewX", "skewY"];
  var NAME = { x: "translateX", y: "translateY", z: "translateZ", transformPerspective: "perspective" };
  var UNIT = { transformPerspective: "px", x: "px", y: "px", z: "px", translateX: "px", translateY: "px", translateZ: "px", rotate: "deg", rotateX: "deg", rotateY: "deg", rotateZ: "deg", skew: "deg", skewX: "deg", skewY: "deg" };
  function transform(st) {
    var s = "";
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], v = st[k]; if (v === undefined) continue;
      if (v !== (k.indexOf("scale") === 0 ? 1 : 0)) s += (NAME[k] || k) + "(" + v + (UNIT[k] || "") + ") ";
    }
    return s.trim() || "none";
  }
  function render(el) {
    var st = el.__fx;
    if ("opacity" in st) el.style.opacity = st.opacity;
    el.style.transform = transform(st);
  }
  function set(el, values) { var st = el.__fx || (el.__fx = {}); for (var k in values) if (k !== "transition") st[k] = values[k]; render(el); }

  // ---- scroll appear (withFX styleAppear) ---------------------------------
  var KEYS = ["opacity", "x", "y", "scale", "rotate", "rotateX", "rotateY", "skewX", "skewY", "transformPerspective"];
  var DEF = { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, transformPerspective: 0 };
  var DEF0 = { x: 0, y: 0, scale: 1, rotate: 0, rotateX: 0, rotateY: 0, skewX: 0, skewY: 0, transformPerspective: 0 };
  var thresholds = []; for (var q = 0; q < 100; q++) thresholds.push(q * 0.01);
  function pick(v) { var o = {}; KEYS.forEach(function (k) { o[k] = v && v[k] != null ? v[k] : DEF[k]; }); return o; }
  (spec.scroll || []).forEach(function (s) {
    var el = byId[s.id]; if (!el) return;
    var enter = pick(s.enter), target = pick({ opacity: s.targetOpacity == null ? 1 : s.targetOpacity }), exit = pick(s.exit);
    // prefer what Framer actually rendered (it can carry layer styles such as a fixed rotate)
    if (s.hidden) { enter = pick(Object.assign({}, DEF0, s.hidden)); }
    if (s.settled) { target = pick(Object.assign({}, DEF0, s.settled)); if (s.settled.opacity == null) target.opacity = s.targetOpacity == null ? 1 : s.targetOpacity; }
    var tr = s.transition, inView = false, once = false;
    if (reduced) return;
    set(el, enter);
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var r = e.boundingClientRect, ok = r.height === 0 ? e.isIntersecting : e.isIntersecting && e.intersectionRect.height / Math.min(r.height, innerHeight) >= (s.threshold || 0);
        if (ok && !inView) {
          if (s.once && once) return; once = true; inView = true;
          KEYS.forEach(function (k) { animate(el, k, target[k], k === "scale" ? Object.assign({ restDelta: 0.001 }, tr) : tr, tr && tr.delay); });
          if (s.once) io.disconnect();
        } else if (!ok && inView) {
          inView = false; if (s.once) return;
          var xt = (s.exit && s.exit.transition) || tr;
          KEYS.forEach(function (k) { animate(el, k, exit[k], xt, xt && xt.delay); });
        }
      });
    }, { threshold: thresholds, rootMargin: "0px 0px 0px 0px" });
    io.observe(el);
  });

  // ---- text effect (appear, per word) -------------------------------------
  (spec.text || []).forEach(function (s) {
    var el = byId[s.id]; if (!el || reduced) return;
    var spans = [].filter.call(el.querySelectorAll("span"), function (x) { return x.style.display === "inline-block"; });
    var fx = s.effect, from = {}, to = {};
    ["opacity", "x", "y", "scale", "rotate", "rotateX", "rotateY", "skewX", "skewY"].forEach(function (k) { if (fx[k] != null) { from[k] = fx[k]; to[k] = DEF[k]; } });
    spans.forEach(function (sp) { set(sp, from); });
    var play = function () {
      var tr = Object.assign({}, s.transition, { restDelta: 0.001 }), step = s.transition && s.transition.delay || 0, start = s.startDelay || 0;
      spans.forEach(function (sp, i) { for (var k in to) animate(sp, k, to[k], tr, start + i * step); });
    };
    if (s.trigger === "onMount") return play();
    var active = false;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting === active) return; active = e.isIntersecting; if (active) { io.disconnect(); play(); } });
    }, { threshold: s.threshold || 0 });
    io.observe(el);
  });

  // ---- appear on load (framer appear animations) ---------------------------
  if (spec.appear && !reduced) {
    var hash; (spec.breakpoints || []).some(function (b) { if (matchMedia(b.mediaQuery).matches) { hash = b.hash; return true; } });
    document.querySelectorAll("[data-framer-appear-id]").forEach(function (el) {
      var a = spec.appear[el.getAttribute("data-framer-appear-id")]; if (!a) return;
      var v = (hash && a[hash] !== undefined ? a[hash] : a["default"]); if (!v) return;
      var init = {}, tgt = {};
      for (var k in v.initial) init[k] = v.initial[k];
      for (k in v.animate) if (k !== "transition") tgt[k] = v.animate[k];
      set(el, init);
      requestAnimationFrame(function () { var tr = v.animate.transition; for (var k in tgt) animate(el, k, tgt[k], tr, tr && tr.delay); });
    });
  }

  // ---- ticker (Framer's Ticker component) ----------------------------------
  (spec.ticker || []).forEach(function (s) {
    var ul = byId[s.id]; if (!ul) return;
    var section = ul.parentElement, horiz = s.dir === "left" || s.dir === "right";
    var originals = [].filter.call(ul.children, function (li) { return li.getAttribute("aria-hidden") !== "true"; });
    var fn = { left: function (v) { return "translateX(-" + v + "px)"; }, right: function (v) { return "translateX(" + v + "px)"; }, top: function (v) { return "translateY(-" + v + "px)"; }, bottom: function (v) { return "translateY(" + v + "px)"; } }[s.dir];
    var anim = null, dupes = [], inView = false, lastKey = "";
    function measure() {
      var gap = parseFloat(getComputedStyle(ul).columnGap || getComputedStyle(ul).gap) || 0;
      var first = originals[0], last = originals[originals.length - 1];
      var parent = horiz ? section.offsetWidth : section.offsetHeight;
      var children = (horiz ? last.offsetLeft + last.offsetWidth - first.offsetLeft : last.offsetTop + last.offsetHeight - first.offsetTop) + gap;
      return { parent: parent, children: children };
    }
    function build() {
      var m = measure(); if (!m.children) return;
      var key = m.parent + ":" + m.children; if (key === lastKey) return; lastKey = key;
      var U = Math.min(Math.round(m.parent / m.children * 2) + 1, 100);
      dupes.forEach(function (d) { d.remove(); }); dupes = [];
      for (var i = 0; i < U; i++) originals.forEach(function (li) {
        var d = li.cloneNode(true); d.setAttribute("aria-hidden", "true");
        d.removeAttribute("data-fx"); d.querySelectorAll("[data-fx]").forEach(function (x) { x.removeAttribute("data-fx"); });
        d.style.width = li.style.width; d.style.height = li.style.height; d.style.willChange = inView ? "transform" : "";
        ul.appendChild(d); dupes.push(d);
      });
      var G = m.children + m.children * Math.round(m.parent / m.children);
      if (anim) anim.cancel();
      if (!G || !s.speed || reduced) return;
      anim = ul.animate({ transform: [fn(0), fn(G)] }, { duration: Math.abs(G) / s.speed * 1000, iterations: Infinity, easing: "linear" });
      sync();
    }
    function sync() {
      ul.style.willChange = inView ? "transform" : "auto";
      dupes.forEach(function (d) { d.style.willChange = inView ? "transform" : ""; });
      if (!anim) return;
      if (inView && !document.hidden && anim.playState === "paused") anim.play();
      else if ((!inView || document.hidden) && anim.playState === "running") anim.pause();
    }
    ul.addEventListener("mouseenter", function () { if (anim) anim.playbackRate = s.hoverFactor == null ? 1 : s.hoverFactor; });
    ul.addEventListener("mouseleave", function () { if (anim) anim.playbackRate = 1; });
    document.addEventListener("visibilitychange", sync);
    new IntersectionObserver(function (es) { inView = es[es.length - 1].isIntersecting; sync(); }).observe(section);
    new ResizeObserver(function () { build(); }).observe(section);
    build();
  });

  // ---- hovers and clicks (recorded from Framer, replayed op by op) -----------
  function find(id) {
    if (id == null) return null;
    var e = byId[id];
    if (e && e.isConnected) return e;
    e = document.querySelector('[data-fx="' + id + '"]');
    if (e) byId[id] = e;
    return e;
  }
  function register(node) {
    [node].concat([].slice.call(node.querySelectorAll("[data-fx]"))).forEach(function (x) { if (x.getAttribute && x.getAttribute("data-fx")) byId[x.getAttribute("data-fx")] = x; });
  }
  function Runner() { this.timers = []; this.anims = []; }
  Runner.prototype.stop = function () { this.timers.forEach(clearTimeout); this.timers = []; };
  Runner.prototype.run = function (ops, other) {
    var self = this;
    ops.forEach(function (op) {
      var go = function () { exec(op, self, other); };
      if (op[1] <= 0) go(); else self.timers.push(setTimeout(go, op[1]));
    });
  };
  var tpl = document.createElement("template"), slotOf = {};
  function exec(op, me, other) {
    var kind = op[0], el;
    if (kind === "attr") {
      el = find(op[2]); if (!el) return;
      // hovers were recorded in the page's initial state; once a click moved an element to another
      // state (gallery thumb now active), its attributes follow that state instead
      var own = slotOf[op[2] + "|" + op[3]];
      if (own && own.g.__cur !== 0) { var v = own.g.states[own.g.__cur][0][own.i]; if (v === null) el.removeAttribute(op[3]); else el.setAttribute(op[3], v); return; }
      if (op[4] === null) el.removeAttribute(op[3]); else el.setAttribute(op[3], op[4]);
    } else if (kind === "add") {
      var parent = find(op[2]); if (!parent) return;
      tpl.innerHTML = op[4]; var node = tpl.content.firstElementChild; if (!node) return;
      var old = node.getAttribute("data-fx") && find(node.getAttribute("data-fx"));
      if (old) { old.__removing && clearTimeout(old.__removing); return; }
      var next = find(op[3]);
      parent.insertBefore(node, next && next.parentNode === parent ? next : null);
      register(node);
    } else if (kind === "remove") {
      el = find(op[2]); if (el) el.remove();
    } else if (kind === "anim") {
      el = find(op[2]); if (!el || reduced) return;
      var kf = op[3].map(function (k) { var o = {}; for (var x in k) o[x] = k[x]; return o; });
      // interrupted? start from what is on screen now
      var running = other ? other.anims.filter(function (a) { return a.effect && a.effect.target === el && a.playState === "running"; }) : [];
      if (running.length) {
        var cs = getComputedStyle(el);
        for (var p in kf[0]) if (p !== "offset" && p !== "easing") kf[0][p] = p.indexOf("--") === 0 ? cs.getPropertyValue(p) : cs[p];
        running.forEach(function (a) { a.cancel(); });
      }
      var a;
      try { a = el.animate(kf, op[4]); } catch (err) { return; }
      me.anims.push(a);
      a.onfinish = function () { a.cancel(); me.anims.splice(me.anims.indexOf(a), 1); };
    }
  }
  (spec.interactions || []).forEach(function (s) {
    var el = find(s.on); if (!el) return;
    var rin = new Runner(), rout = new Runner(), on = false, base = el.getAttribute("style");
    function enter() { if (on || el.__locked) return; on = true; rout.stop(); rin.run(s["in"], rout); }
    function leave() { if (!on || el.__locked) return; on = false; rin.stop(); rout.run(s.out, rin); }
    // a submit button whose form left the Default variant has no hover state in Framer: drop it
    el.__unhover = function () {
      on = false; rin.stop(); rout.stop();
      rin.anims.concat(rout.anims).forEach(function (a) { a.cancel(); }); rin.anims = []; rout.anims = [];
      if (base == null) el.removeAttribute("style"); else el.setAttribute("style", base);
    };
    // ...and when an error sends it back to Default, Framer shows it hovered until the next pointer move
    el.__rehover = function () { el.__locked = false; on = false; setTimeout(enter, 100); };
    if (s.kind === "hover") {
      el.addEventListener("pointerenter", function (e) { if (e.pointerType !== "touch") enter(); });
      el.addEventListener("pointerleave", function (e) { if (e.pointerType !== "touch") leave(); });
    } else {
      el.addEventListener("click", function () { if (on && s.toggle) leave(); else { on = false; enter(); } });
    }
  });

  // ---- click state machines (menus, accordions, galleries) ------------------
  function afterPaint(fn) { requestAnimationFrame(function () { var ch = new MessageChannel(); ch.port1.onmessage = fn; ch.port2.postMessage(0); }); }
  (spec.clickGroups || []).forEach(function (g) {
    var cur = 0, grave = {}, startNext = {}; g.__cur = 0;
    g.attrs.forEach(function (slot, i) { slotOf[slot[0] + "|" + slot[1]] = { g: g, i: i }; });
    g.nodeIds.forEach(function (id) { var e = find(id); if (e) startNext[id] = e.nextElementSibling; });
    var layoutIds = {};
    Object.keys(g.triggers).forEach(function (k) { g.triggers[k].forEach(function (t) { t[2].forEach(function (op) { if (isLayout(op[3])) layoutIds[op[2]] = true; }); }); });
    function isLayout(kf) { return kf.some(function (f) { return /translate3d|scale\(/.test(f.transform || ""); }); }
    var exiting = {};
    function apply(si, rm) {
      var st = g.states[si], vals = st[0], want = {};
      st[1].forEach(function (id) { want[id] = true; });
      g.nodeIds.forEach(function (id) {
        var e = find(id);
        if (exiting[id]) { clearTimeout(exiting[id]); delete exiting[id]; if (!want[id] && e) { grave[id] = e; e.remove(); e = null; } }
        if (!want[id] && e) {
          if (rm && rm[id] && !reduced) exiting[id] = setTimeout(function () { delete exiting[id]; grave[id] = e; e.remove(); }, rm[id]);
          else { grave[id] = e; e.remove(); }
        }
      });
      g.nodeIds.forEach(function (id) {
        if (!want[id] || find(id)) return;
        var info = g.nodes[id] || {}, e = grave[id];
        if (!e && info.html) { tpl.innerHTML = info.html; e = tpl.content.firstElementChild; }
        var parent = find(info.parent) || (e && startNext[id] && startNext[id].parentNode); if (!e || !parent) return;
        var next = find(info.next) || startNext[id];
        parent.insertBefore(e, next && next.parentNode === parent ? next : null);
        register(e);
      });
      g.attrs.forEach(function (slot, i) {
        var e = find(slot[0]); if (!e) return; var v = vals[i];
        if (v === null) e.removeAttribute(slot[1]); else if (e.getAttribute(slot[1]) !== v) e.setAttribute(slot[1], v);
      });
    }
    var runner = new Runner();
    function go(to, anims, from, rm) {
      if (to === cur) return;
      var exact = from === cur, before = {};
      if (!exact) Object.keys(layoutIds).forEach(function (id) { var e = find(id); if (e) before[id] = e.getBoundingClientRect(); });
      runner.anims.forEach(function (a) { a.cancel(); }); runner.anims = [];
      apply(to, rm); cur = g.__cur = to;
      if (reduced) return;
      anims.forEach(function (op) {
        if (!exact && layoutIds[op[2]]) return flip(op, before[op[2]]);
        var n = runner.anims.length; exec(op, runner, null);
        // an exiting node keeps its last frame until Framer would have unmounted it
        if (exiting[op[2]] && runner.anims.length > n) { var a = runner.anims[runner.anims.length - 1]; a.onfinish = null; a.effect.updateTiming({ fill: "both" }); }
      });
    }
    function flip(op, r0) {
      var e = find(op[2]); if (!e || !r0) return;
      var r1 = e.getBoundingClientRect(); if (!r1.width || !r1.height) return;
      var sx = r0.width / r1.width, sy = r0.height / r1.height;
      var dx = (r0.left + r0.width / 2) - (r1.left + r1.width / 2), dy = (r0.top + r0.height / 2) - (r1.top + r1.height / 2);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.002 && Math.abs(sy - 1) < 0.002) return;
      // reuse the recorded timing curve of this element, swapped onto the new geometry
      var kf = op[3], n = kf.length, frames = [];
      var y0 = num(kf[0]), yN = 0;
      for (var i = 0; i < n; i++) {
        var p = y0 ? 1 - num(kf[i]) / y0 : i / (n - 1);
        frames.push({ offset: kf[i].offset, transform: "translate3d(" + dx * (1 - p) + "px, " + dy * (1 - p) + "px, 0px) scale(" + (sx + (1 - sx) * p) + ", " + (sy + (1 - sy) * p) + ")" });
      }
      frames[n - 1].transform = "none";
      var a = e.animate(frames, op[4]); runner.anims.push(a); a.onfinish = function () { a.cancel(); };
    }
    function num(f) { var m = /translate3d\(\s*-?[\d.e-]+px,\s*(-?[\d.e-]+)px/.exec(f.transform || ""); return m ? +m[1] : 0; }
    Object.keys(g.triggers).forEach(function (id) {
      var el = find(id); if (!el) return;
      var ts = g.triggers[id], count = {}, best = ts[0][1];
      // a state nobody recorded leaving through this trigger: go where it usually leads
      ts.forEach(function (t) { count[t[1]] = (count[t[1]] || 0) + 1; if (count[t[1]] > count[best]) best = t[1]; });
      // Framer commits the new variant through React's scheduler, right after the next frame is painted
      el.addEventListener("click", function () {
        afterPaint(function () {
          var t = ts.filter(function (x) { return x[0] === cur; })[0];
          if (t) go(t[1], t[2], t[0], t[3]);
          else { var any = ts.filter(function (x) { return x[1] === best; })[0]; go(best, any[2], any[0], any[3]); }
        });
      });
    });
  });

  // ---- contact form ---------------------------------------------------------
  // Same behaviour as Framer's form: empty-state class on inputs, Loading / Success / Error button
  // variants. Where it posts is set in /assets/js/form-config.js.
  (function () {
    var form = document.querySelector("form"); if (!form) return;
    form.querySelectorAll("input.framer-form-input").forEach(function (i) {
      i.addEventListener("input", function () { i.classList.toggle("framer-form-input-empty", !i.value); });
    });
    if (!spec.form) return;
    // node ids made up for the recorded states (h0, e3...) repeat in every breakpoint: keep them apart
    spec.form.bps.forEach(function (b, n) {
      var tag = function (id) { return typeof id === "string" && /^[eh]\d+$/.test(id) ? id + "-" + n : id; };
      ["pending", "success", "error"].forEach(function (k) {
        b[k] = b[k].map(function (o) {
          o = o.slice(); o[2] = tag(o[2]);
          if (o[0] === "add") { o[3] = tag(o[3]); o[4] = o[4].replace(/data-fx="([eh]\d+)"/g, function (_, id) { return 'data-fx="' + id + "-" + n + '"'; }); }
          return o;
        });
      });
    });
    var busy = false, sent = false, runners = [];  // one message per page view: the Success state stays put
    function run(key) { runners.forEach(function (r) { r.stop(); }); runners = spec.form.bps.map(function (b) { var r = new Runner(); r.run(b[key], null); return r; }); }
    form.addEventListener("submit", function (e) {
      e.preventDefault(); if (busy || sent) return; busy = true;
      var cfg = window.TERMTEAM_FORM || {}, data = new FormData(form), url = cfg.endpoint;
      if (cfg.accessKey) {
        data.append("access_key", cfg.accessKey);
        if (cfg.subject) data.append("subject", cfg.subject);
        if (cfg.fromName) data.append("from_name", cfg.fromName);
        if (data.get("Email")) data.append("replyto", data.get("Email"));
      }
      var buttons = [].slice.call(form.querySelectorAll("button[type=submit]"));
      buttons.forEach(function (b) { b.__locked = true; b.__unhover && b.__unhover(); });
      afterPaint(function () { run("pending"); });
      fetch(url, { method: "POST", body: data, headers: { accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json().catch(function () { return {}; }).then(function (j) { return j.success !== false; }) : false; }, function () { return false; })
        .then(function (ok) { busy = false; sent = ok; run(ok ? "success" : "error"); if (!ok) buttons.forEach(function (b) { b.__rehover ? b.__rehover() : (b.__locked = false); }); });
    });
  })();

  window.__motion = { animate: animate, set: set, spring: spring, generator: generator, transform: transform, byId: byId, spec: spec };
})();
