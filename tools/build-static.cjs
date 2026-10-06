// Build a static page from Framer's SSR plus the settled DOM harvested at each breakpoint.
// node tools/build-static.js <capture-dir> <harvest-dir> <out-dir> <slug>
const { chromium } = require(process.env.PW || "playwright");
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const [CAP, HV, OUT, slug] = process.argv.slice(2);
const BPS = [["desktop", 1440], ["tablet", 1000], ["phone", 390]];
const NET = JSON.parse(fs.readFileSync(`${CAP}/net/index.json`, "utf8"));
const route = slug === "home" ? "" : slug.replace(/__/g, "/");

const TAG = `<script>(function(){var n=0;document.querySelectorAll("#main *").forEach(function(e){e.setAttribute("data-uid",n++)})})()</script>`;

(async () => {
  let ssr = fs.readFileSync(`${CAP}/${slug}/ssr.html`, "utf8");
  const i = ssr.indexOf("<script", ssr.indexOf('<div id="main"'));
  ssr = ssr.slice(0, i) + TAG + ssr.slice(i);
  ssr = ssr.replace(/<script\b(?![^>]*>\(function\(\)\{var n=0)[^>]*>[\s\S]*?<\/script>/g, "");
  const H = BPS.map(([bp, w]) => [bp, JSON.parse(fs.readFileSync(`${HV}/${slug}-${w}.json`, "utf8"))]);

  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const p = await b.newPage();
  await p.route("**/*", (r) => r.request().url() === "https://termteam.hr/x" ? r.fulfill({ contentType: "text/html; charset=utf-8", body: ssr }) : r.abort());
  await p.goto("https://termteam.hr/x", { waitUntil: "domcontentloaded" });
  const report = await p.evaluate((H) => {
    const rep = { conflicts: [], missing: 0, tagMismatch: 0 };
    const byUid = {}; document.querySelectorAll("[data-uid]").forEach((e) => (byUid[e.dataset.uid] = e));
    const owner = {};
    for (const [bp, h] of H) {
      for (const [uid, d] of Object.entries(h.dom.o)) {
        const e = byUid[uid]; if (!e) { rep.missing++; continue; }
        if (e.tagName.toLowerCase() !== d.tag) { rep.tagMismatch++; continue; }
        if (owner[uid]) { // shared node, already set by an earlier breakpoint
          const prev = owner[uid].attrs; const diff = Object.keys({ ...prev, ...d.attrs }).filter((k) => prev[k] !== d.attrs[k]);
          if (diff.length) rep.conflicts.push([uid, bp, diff.map((k) => `${k}: ${String(prev[k]).slice(0, 80)} | ${String(d.attrs[k]).slice(0, 80)}`)]);
          continue;
        }
        owner[uid] = { bp, attrs: d.attrs };
        for (const a of [...e.attributes]) if (a.name !== "data-uid" && !(a.name in d.attrs)) e.removeAttribute(a.name);
        for (const [k, v] of Object.entries(d.attrs)) if (e.getAttribute(k) !== v) e.setAttribute(k, v);
        if (d.kids) {
          const nodes = d.kids.map((k) => { if (k.uid !== undefined) return byUid[k.uid]; if (k.text !== undefined) return document.createTextNode(k.text); const t = document.createElement("template"); t.innerHTML = k.html; const n = t.content.firstChild; n.setAttribute && n.setAttribute("data-rt", bp); return n; }).filter(Boolean);
          e.replaceChildren(...nodes);
        }
      }
    }
    // hidden variants nobody owns stay as SSR rendered them
    rep.unowned = Object.keys(byUid).filter((u) => !owner[u] && !byUid[u].closest("[data-rt]")).length;
    return rep;
  }, H);
  // motion spec
  const spec = { scroll: [], text: [] }; const used = new Set();
  for (const [bp, h] of H) {
    for (const [uid, f] of Object.entries(h.fx)) {
      if (f.kind !== "scroll" || used.has(uid)) continue; used.add(uid); const c = f.cfg;
      // what Framer actually rendered: hidden state at hydration, settled state at the end
      const first = h.log.find((l) => String(l[1]) === uid && l[2] === "style" && /translateY\(/.test(l[3] || "")) || h.log.find((l) => String(l[1]) === uid && l[2] === "style");
      const hidden = first ? readMotion(first[3]) : null; const settled = readMotion(h.dom.o[uid] && h.dom.o[uid].attrs.style);
      if (hidden && hidden.y !== undefined) hidden.y = Math.round(hidden.y * 1000 - f.id / 10) / 1000; // strip the instrumentation tag
      if (hidden) for (const k of Object.keys(hidden)) if (k !== "opacity" && Math.abs(hidden[k]) < 1e-9) delete hidden[k];
      spec.scroll.push({ id: uid, hidden, settled, enter: c.__framer__enter, exit: c.__framer__exit, transition: c.__framer__animate && c.__framer__animate.transition, threshold: c.__framer__threshold, once: !!c.__framer__animateOnce, targetOpacity: c.__targetOpacity });
    }
    for (const t of h.textFx) for (const uid of h.text[t.cfg.className] || []) {
      if (used.has(String(uid))) continue; used.add(String(uid)); const e = t.cfg.effect;
      spec.text.push({ id: String(uid), effect: e.effect, transition: e.transition, threshold: e.threshold, trigger: e.trigger, startDelay: e.startDelay, tokenization: e.tokenization });
    }
  }
  // tickers: Framer's Ticker runs a WAAPI translate on the <ul>; motion.js rebuilds the duplicates itself
  spec.ticker = []; const tick = new Set();
  for (const [bp, h] of H) for (const a of h.waapi || []) {
    if (a.tag !== "UL" || a.timing.iterations !== "Infinity") continue;
    const to = a.kf[a.kf.length - 1].transform || ""; const m = /translate([XY])\((-?[\d.]+)px\)/.exec(to); if (!m) continue;
    const G = Math.abs(+m[2]); const dir = m[1] === "X" ? (+m[2] < 0 ? "left" : "right") : (+m[2] < 0 ? "top" : "bottom");
    if (!tick.has(a.uid)) { tick.add(a.uid); used.add(String(a.uid)); spec.ticker.push({ id: String(a.uid), dir, speed: +(G / a.timing.duration * 1000).toFixed(4), hoverFactor: 1 }); }
  }
  await p.evaluate((ids) => { for (const id of ids) { const ul = document.querySelector(`[data-uid="${id}"]`); if (ul) [...ul.children].forEach((li) => li.getAttribute("aria-hidden") === "true" && li.remove()); } }, [...tick]);
  // hovers + clicks
  const { fromHover, clickGroups } = require("./interact-spec.cjs");
  spec.interactions = [];
  for (const [bp, h] of H) {
    for (const r of h.hovers || []) { const x = fromHover(r, h.waapi.map((a) => ({ id: a.uid, timing: a.timing }))); if (x.in.length || x.out.length) spec.interactions.push(x); }
  }
  const ref = (v) => v != null && used.add(String(v));
  // clicks: state machines per group of clicks touching the same elements
  spec.clickGroups = []; const seenTrig = new Set();
  for (const [bp, h] of H) {
    const rt = {}; // runtime nodes (data-ruid) only exist inside kids html
    for (const d of Object.values(h.dom.o)) for (const k of d.kids || []) if (k.html) for (const m of k.html.matchAll(/<[a-z][^>]*?\bdata-ruid="(r\d+)"[^>]*>/g)) { const a = {}; for (const x of m[0].matchAll(/([\w:-]+)="([^"]*)"/g)) a[x[1]] = x[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&"); rt[m[1]] = a; }
    const baseAttr = (id, a) => { const o = h.dom.o[id] ? h.dom.o[id].attrs : rt[id]; return o && a in o ? o[a] : null; };
    const xf = process.env.XDIR && `${process.env.XDIR}/x-${slug}-${BPS.find((x) => x[0] === bp)[1]}.json`;
    const recs = xf && fs.existsSync(xf) ? JSON.parse(fs.readFileSync(xf, "utf8")).clicks : h.clicks || [];
    const groups = clickGroups(recs, baseAttr, h.waapi.map((a) => ({ id: a.uid, timing: a.timing })));
    for (const g of groups) {
      const ids = Object.keys(g.triggers); if (ids.every((i) => seenTrig.has(i))) continue; ids.forEach((i) => seenTrig.add(i));
      if (g.states.length < 2) continue;
      g.bp = bp; spec.clickGroups.push(g);
    }
  }
  for (const g of spec.clickGroups) {
    for (const id of Object.keys(g.triggers)) ref(id);
    for (const [id] of g.attrs) ref(id);
    for (const id of g.nodeIds) { ref(id); const n = g.nodes[id]; if (n) { ref(n.parent); ref(n.next); if (n.html) n.html = rewrite(n.html.replace(/ data-hn="/g, ' data-fx="').replace(/ data-ruid="/g, ' data-fx="'), true); } }
    for (const ts of Object.values(g.triggers)) for (const t of ts) for (const o of t[2]) ref(o[2]);
  }
  for (const x of spec.interactions) { ref(x.on); for (const o of [...x.in, ...x.out]) { if (o[0] === "attr" || o[0] === "remove" || o[0] === "anim") ref(o[2]); if (o[0] === "add") { ref(o[2]); ref(o[3]); o[4] = rewrite(o[4].replace(/ data-hn="/g, ' data-fx="').replace(/ data-ruid="/g, ' data-fx="'), true); } } }
  // contact form: Framer's submit button states, recorded offline (the request was answered locally)
  if (process.env.FORMDIR && fs.existsSync(`${process.env.FORMDIR}/form-1440.json`)) {
    const { phase } = require("./interact-spec.cjs");
    const action = /action:`(https:\/\/api\.framer\.com\/forms\/[^`]+)`/.exec(fs.readdirSync(`${CAP}/net`).map((f) => f.endsWith(".json") ? "" : fs.readFileSync(`${CAP}/net/${f}`, "latin1")).find((t) => t.includes("api.framer.com/forms/")) || "");
    spec.form = { action: action && action[1], bps: [] };
    for (const [bp, w] of BPS) {
      const f = `${process.env.FORMDIR}/form-${w}.json`; if (!fs.existsSync(f)) continue;
      const d = JSON.parse(fs.readFileSync(f, "utf8"));
      const split = (sess) => { const t0 = sess.marks.submit; const r = sess.log.find((l) => l[0] > t0 + 5 && l[2] === "remove" && /^h/.test(l[1])); return [t0, r ? r[0] : sess.marks.end]; };
      const clean = (ops) => ops.filter((o) => !(o[0] === "attr" && (o[3] === "value" || o[3] === "data-hn")));
      const [s0, r0] = split(d.ok), [e0, re] = split(d.err);
      // Framer's spinner: loop rotate 0 -> 360, 1s linear tween (Spinner component, __framer__loop config)
      const pending = clean(phase(d.ok.log, s0, r0, [], [])).filter((o) => !(o[0] === "anim" && /^h/.test(o[2])));
      const spin = d.ok.log.find((l) => l[0] > s0 && l[2] === "add" && /data-framer-name="Spinner"/.test(l[3]));
      const conic = spin && (/data-framer-name="Conic" data-hn="(h\d+)"/.exec(spin[3]) || [])[1];
      if (conic) pending.push(["anim", 0, conic, [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: 1000, iterations: Infinity, easing: "linear" }]);
      const success = clean(phase(d.ok.log, r0, Infinity, [], []));
      // error session numbered its mounted nodes from h0 too; rename the ones it adds after the response
      const added = new Set(d.err.log.filter((l) => l[0] >= re && l[2] === "add").flatMap((l) => [...l[3].matchAll(/data-hn="(h\d+)"/g)].map((m) => m[1])));
      const ren = (v) => typeof v === "string" ? v.replace(/\bh(\d+)\b/g, (m, n) => added.has(m) ? "e" + n : m) : v;
      const error = clean(phase(d.err.log, re, Infinity, [], [])).map((o) => o.map((v, i) => i === 0 ? v : (o[0] === "add" && i === 4 ? v.replace(/data-hn="(h\d+)"/g, (m, id) => `data-hn="${ren(id)}"`) : ren(v))));
      // a new submit starts from Default again: drop whatever the last result mounted
      const resultNodes = [...success, ...error].filter((o) => o[0] === "add").map((o) => (/data-hn="([he]\d+)"/.exec(o[4]) || [])[1]).filter(Boolean);
      for (const id of resultNodes) pending.unshift(["remove", 0, id]);
      const b = { bp, pending, success, error }; spec.form.bps.push(b);
      for (const ops of [pending, success, error]) for (const o of ops) { if (o[0] === "add") { ref(o[2]); ref(o[3]); o[4] = rewrite(o[4].replace(/ data-hn="/g, ' data-fx="').replace(/ data-ruid="/g, ' data-fx="'), true); } else ref(o[2]); }
    }
  }
  const m1 = /<script type="framer\/appear" id="__framer__appearAnimationsContent">([\s\S]*?)<\/script>/.exec(fs.readFileSync(`${CAP}/${slug}/ssr.html`, "utf8"));
  const m2 = /<script type="framer\/appear" id="__framer__breakpoints">([\s\S]*?)<\/script>/.exec(fs.readFileSync(`${CAP}/${slug}/ssr.html`, "utf8"));
  if (m1) spec.appear = JSON.parse(m1[1]); if (m2) spec.breakpoints = JSON.parse(m2[1]);
  await p.evaluate(({ spec, ids }) => {
    for (const id of ids) { const e = document.querySelector(`[data-uid="${id}"],[data-ruid="${id}"]`); if (e) e.setAttribute("data-fx", id); }
    document.querySelectorAll("[data-ruid]").forEach((e) => e.removeAttribute("data-ruid"));
    document.querySelectorAll("script:not([src]):not([type])").forEach((e) => { if (e.textContent.indexOf("data-uid") >= 0) e.remove(); });
    const sc = document.createElement("script"); sc.type = "application/json"; sc.id = "fx-spec"; sc.textContent = JSON.stringify(spec); document.body.appendChild(sc);
    if (spec.form) { const fc = document.createElement("script"); fc.src = "/assets/js/form-config.js"; document.body.appendChild(fc); }
    const js = document.createElement("script"); js.src = "/assets/js/motion.js"; document.body.appendChild(js);
  }, { spec, ids: [...used] });
  console.log(slug, "scroll fx", spec.scroll.length, "text fx", spec.text.length, "tickers", spec.ticker.length, "interactions", spec.interactions.length);
  console.log(slug, "missing", report.missing, "tagMismatch", report.tagMismatch, "unowned", report.unowned, "conflicts", report.conflicts.length);
  fs.mkdirSync(`${OUT}/_report`, { recursive: true });
  fs.writeFileSync(`${OUT}/_report/${slug}.json`, JSON.stringify(report, null, 1));
  let html = "<!doctype html>\n" + (await p.evaluate(() => document.documentElement.outerHTML));
  await b.close();
  fs.writeFileSync(`${OUT}/_raw-${slug}.html`, html);
  html = rewrite(html);
  const dst = route ? `${OUT}/${route}/index.html` : `${OUT}/index.html`;
  fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, html);
  const left = [...new Set(html.match(/https:\/\/(framerusercontent|framer)\.com[^"'\s)]*/g) || [])];
  console.log(slug, "->", dst, html.length, "remote refs left:", left.length, left.slice(0, 4));
})();

function readMotion(style) {
  const o = {}; if (!style) return o;
  const op = /(?:^|;)\s*opacity:\s*([\d.e-]+)/.exec(style); if (op) o.opacity = +op[1];
  const tf = /(?:^|;)\s*transform:\s*([^;]+)/.exec(style);
  const MAP = { perspective: "transformPerspective", translateX: "x", translateY: "y", translateZ: "z", scale: "scale", scaleX: "scaleX", scaleY: "scaleY", rotate: "rotate", rotateX: "rotateX", rotateY: "rotateY", rotateZ: "rotateZ", skewX: "skewX", skewY: "skewY" };
  if (tf && tf[1].trim() !== "none") for (const m of tf[1].matchAll(/(\w+)\(([-\d.e]+)[a-z%]*\)/g)) if (MAP[m[1]]) o[MAP[m[1]]] = +m[2];
  return o;
}
function fromStore(url) {
  const e = NET[url]; if (e && e.status === 200) return `${CAP}/net/${e.file}`;
  const u = new URL(url); const name = (u.pathname.slice(1) + u.search).replace(/[?&=]/g, "_");
  for (const f of [`${CAP}/assets/${name}`, `${CAP}/assets/${u.pathname.slice(1)}`]) if (fs.existsSync(f)) return f;
  return null;
}
function copyTo(src, rel) { const d = `${OUT}${rel}`; if (!fs.existsSync(d)) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(src, d); } return rel; }
function localImage(url) {
  const u = new URL(url.replace(/&amp;/g, "&")); const base = path.basename(u.pathname); const [id, ext0] = base.split("."); const ext = ext0 === "jpeg" ? "jpg" : ext0;
  const sd = u.searchParams.get("scale-down-to"); const rel = `/images/${id}${sd ? "-" + sd : ""}.${ext}`;
  if (fs.existsSync(`${OUT}${rel}`)) return rel;
  const src = fromStore(u.href) || (!sd && fromStore(`https://framerusercontent.com/images/${base}`));
  if (src) return copyTo(src, rel);
  // original requested but only a query-specific copy exists
  const c = fs.readdirSync(`${CAP}/assets/images`).filter((x) => x.startsWith(base));
  if (!sd && c.length) return copyTo(`${CAP}/assets/images/${c[0]}`, rel);
  return null;
}
function rewrite(html, fragment) {
  html = html.replace(/<link[^>]+rel="(?:modulepreload|preload|preconnect|dns-prefetch)"[^>]*>/g, "");
  html = html.replace(/<meta name="(?:generator|framer-[^"]*)"[^>]*>/g, "");
  html = html.replace(/ data-framer-hydrate-v2="[^"]*"/g, "").replace(/ data-framer-ssr-released-at="[^"]*"/g, "").replace(/ data-framer-page-optimized-at="[^"]*"/g, "");
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  // srcset: keep candidates we have locally
  html = html.replace(/ srcset="([^"]*)"/g, (m, v) => { const parts = v.split(/,\s*(?=https:)/).map((c) => { const [u, d] = c.trim().split(/\s+/); const l = /framerusercontent\.com\/images\//.test(u) ? localImage(u) : u; return l ? `${l} ${d}` : null; }).filter(Boolean); return parts.length ? ` srcset="${parts.join(", ")}"` : ""; });
  html = html.replace(/https:\/\/framerusercontent\.com\/images\/[^"'\s)\\]+?(?=&quot;|["'\s)\\]|$)/g, (u) => localImage(u) || (console.log("missing image", u), u));
  html = html.replace(/url\((["']?)(https:\/\/(?:fonts\.gstatic\.com|framerusercontent\.com)\/[^)"']+)\1\)/g, (m, q, u) => { const src = fromStore(u); if (!src) return m; const rel = "/assets/fonts/" + crypto.createHash("md5").update(u).digest("hex").slice(0, 12) + path.extname(new URL(u).pathname); copyTo(src, rel); return `url(${rel})`; });
  html = html.replace(/https:\/\/termteam\.hr\//g, "/").replace(/href="\.\/([^"]*)"/g, 'href="/$1"').replace(/href="\."/g, 'href="/"');
  if (!fragment) html = html.replace(/ data-uid="\d+"/g, "")
    // share previews and canonical links need the real absolute address
    .replace(/(<meta (?:property|name)="(?:og:image|og:url|twitter:image)" content=")\//g, "$1https://termteam.hr/")
    .replace(/(<link rel="canonical" href=")\//g, "$1https://termteam.hr/");
  return html;
}
