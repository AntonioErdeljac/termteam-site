// Replay a live page at one breakpoint, play it through, and dump its settled DOM + motion log.
// node harvest.js <route> <width> <out.json>
const { chromium } = require("playwright"); const fs = require("fs");
const { routeLive } = require("./live.js"); const { FX } = require("./instrument.js");
(async () => {
  const [route, w, out] = process.argv.slice(2); const W = +w, VH = W > 800 ? 900 : 844;
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: W, height: VH } });
  await routeLive(ctx, { tag: true, fx: true });
  await ctx.addInitScript(() => {
    window.__log = []; window.__t0 = performance.now();
    document.addEventListener("DOMContentLoaded", () => new MutationObserver((ms) => { const t = Math.round((performance.now() - window.__t0) * 10) / 10;
      for (const m of ms) { const e = m.target; const u = e.getAttribute && e.getAttribute("data-uid"); if (!u) continue;
        if (m.type === "attributes") window.__log.push([t, +u, m.attributeName, e.getAttribute(m.attributeName)]); else window.__log.push([t, +u, "childList"]); } })
      .observe(document.body, { attributes: true, attributeFilter: ["style", "class"], subtree: true, childList: true }));
  });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("https://termteam.hr" + route, { waitUntil: "load" });
  await p.waitForTimeout(5000);
  const rects = await p.evaluate(() => { const o = {}; document.querySelectorAll("[data-uid]").forEach((e) => { const r = e.getBoundingClientRect(); o[e.dataset.uid] = [r.left, r.top + scrollY, r.width, r.height]; }); return o; });
  const steps = []; const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 100; y < H + 100; y += 100) { const t = await p.evaluate((y) => { scrollTo(0, y); return Math.round((performance.now() - window.__t0) * 10) / 10; }, y); steps.push([t, y]); await p.waitForTimeout(1300); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1500);
  await p.evaluate(() => { let n = 0; document.querySelectorAll("#main *").forEach((e) => { if (!e.hasAttribute("data-uid")) e.setAttribute("data-ruid", "r" + n++); }); });
  const waapi = await p.evaluate(() => document.getAnimations().map((a) => { const e = a.effect && a.effect.target; if (!e) return null; const t = a.effect.getTiming(); return { uid: e.getAttribute("data-uid") || e.getAttribute("data-ruid"), tag: e.tagName, kf: a.effect.getKeyframes(), timing: { duration: t.duration, iterations: t.iterations === Infinity ? "Infinity" : t.iterations, easing: t.easing, delay: t.delay }, rate: a.playbackRate, state: a.playState, name: a.animationName || null }; }).filter(Boolean));
  const dom = await p.evaluate(() => {
    const o = {};
    document.querySelectorAll("#main [data-uid]").forEach((e) => {
      const attrs = {}; for (const a of e.attributes) if (a.name !== "data-uid" && a.name !== "data-ruid") attrs[a.name] = a.value;
      let kids = null;
      if ([...e.childNodes].some((n) => n.nodeType === 1 && !n.hasAttribute("data-uid"))) kids = [...e.childNodes].map((n) => n.nodeType === 1 && n.hasAttribute("data-uid") ? { uid: +n.dataset.uid } : n.nodeType === 1 ? { html: n.outerHTML.replace(/ data-uid="\d+"/g, "") } : n.nodeType === 3 ? { text: n.textContent } : null).filter(Boolean);
      o[e.dataset.uid] = { tag: e.tagName.toLowerCase(), attrs, kids };
    });
    const overlay = document.querySelector("#template-overlay")?.innerHTML || "";
    return { o, overlay };
  });
  const log = await p.evaluate(() => window.__log);
  const text = await p.evaluate((cls) => { const o = {}; for (const c of cls) document.querySelectorAll("." + c).forEach((e) => (o[c] ||= []).push(+e.dataset.uid)); return o; }, Object.values(FX).filter((f) => f.kind === "text").map((f) => f.cfg.className));
  const hovers = [], clicks = [];
  await p.evaluate(() => {
    window.__hl = []; window.__ht0 = performance.now(); let hn = 0;
    const idOf = (e) => e && e.nodeType === 1 ? (e.getAttribute("data-uid") || e.getAttribute("data-ruid") || e.getAttribute("data-hn")) : null;
    window.__idOf = idOf;
    new MutationObserver((ms) => { const t = Math.round((performance.now() - window.__ht0) * 10) / 10;
      for (const m of ms) {
        if (m.type === "attributes") { const u = idOf(m.target); if (u) window.__hl.push([t, u, m.attributeName, m.target.getAttribute(m.attributeName), m.oldValue]); }
        else { for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; n.querySelectorAll && [n, ...n.querySelectorAll("*")].forEach((x) => { if (!idOf(x)) x.setAttribute("data-hn", "h" + hn++); });
            window.__hl.push([t, idOf(n), "add", n.outerHTML, idOf(m.target), idOf(n.nextElementSibling)]); }
          for (const n of m.removedNodes) if (n.nodeType === 1) window.__hl.push([t, idOf(n), "remove", null, idOf(m.target)]); }
      } }).observe(document.body, { attributes: true, subtree: true, attributeOldValue: true, childList: true });
    window.__anims = () => document.getAnimations().map((a) => { const e = a.effect && a.effect.target; const u = idOf(e); if (!u) return null; const tm = a.effect.getTiming(); return { id: u, kf: a.effect.getKeyframes().map((k) => { const o = {}; for (const x in k) if (!["computedOffset", "composite"].includes(x)) o[x] = k[x]; return o; }), timing: { duration: tm.duration, iterations: tm.iterations === Infinity ? "Infinity" : tm.iterations, easing: tm.easing, delay: tm.delay, fill: tm.fill }, t: a.currentTime, rate: a.playbackRate, pseudo: a.effect.pseudoElement || null, css: a.animationName || a.transitionProperty || null }; }).filter(Boolean);
  });
  const now = () => p.evaluate(() => Math.round((performance.now() - window.__ht0) * 10) / 10);
  const center = (id, scroll) => p.evaluate(([id, scroll]) => { const e = document.querySelector(`[data-uid="${id}"],[data-ruid="${id}"]`); if (!e) return null; if (scroll) e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, [id, scroll]);
  const snapA = () => p.evaluate(() => window.__anims());
  const hoverClasses = Object.values(FX).filter((f) => f.kind === "hover" && f.cfg.className).map((f) => f.cfg.className);
  const cands = await p.evaluate((hc) => [...document.querySelectorAll("#main [data-uid], #main [data-ruid]")].filter((e) => { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) return false; if (e.closest("[aria-hidden=true]")) return false; const cs = getComputedStyle(e); return e.tagName === "A" || e.hasAttribute("data-highlight") || hc.some((c) => e.classList.contains(c)) || (cs.cursor === "pointer" && getComputedStyle(e.parentElement).cursor !== "pointer"); }).map((e) => ({ id: e.getAttribute("data-uid") || e.getAttribute("data-ruid"), link: e.tagName === "A" || !!e.closest("a") || !!e.querySelector("a") })), hoverClasses);
  if (W > 800) for (const { id } of cands) {
    const box = await center(id, true); if (!box) continue;
    await p.mouse.move(W - 2, 2); await p.waitForTimeout(700);
    const box2 = await center(id, false); if (!box2) continue;
    await p.evaluate(() => { window.__hl = []; });
    const t0 = await now(); await p.mouse.move(box2[0], box2[1]); await p.waitForTimeout(40); const aIn = await snapA(); await p.waitForTimeout(1360);
    const t1 = await now(); await p.mouse.move(W - 2, 2); await p.waitForTimeout(40); const aOut = await snapA(); await p.waitForTimeout(1360);
    const hl = await p.evaluate(() => window.__hl);
    if (hl.length || aIn.length > waapi.length) hovers.push({ id, t0, t1, log: hl, aIn, aOut });
  }
  for (const { id, link } of cands) {
    if (link) continue;
    const box = await center(id, true); if (!box) continue; await p.waitForTimeout(600);
    await p.evaluate(() => { window.__hl = []; });
    const href0 = await p.evaluate(() => location.href);
    const t0 = await now(); await p.mouse.click(box[0], box[1]); await p.mouse.move(W - 2, 2); await p.waitForTimeout(40); const a1 = await snapA(); await p.waitForTimeout(1560);
    if ((await p.evaluate(() => location.href)) !== href0) { console.error("navigated on click", id); break; }
    const t1 = await now(); const box2 = await center(id, false); let a2 = [];
    if (box2) { await p.mouse.click(box2[0], box2[1]); await p.mouse.move(W - 2, 2); await p.waitForTimeout(40); a2 = await snapA(); await p.waitForTimeout(1560); }
    await p.mouse.move(W - 2, 2); await p.waitForTimeout(600);
    const hl = await p.evaluate(() => window.__hl);
    if (hl.length) clicks.push({ id, t0, t1, log: hl, a1, a2 });
  }
  // fx ids: first hydration transform with fractional y tag
  const fx = {}; const seen = new Set();
  for (const [t, u, k, v] of log) if (k === "style" && !seen.has(u)) { const m = /translateY\((-?[\d.]+)px\)/.exec(v || ""); if (!m) continue; seen.add(u); if (!/opacity: 0(\.001)?;/.test(v)) continue; const y = +m[1];
    for (const [id, f] of Object.entries(FX)) { const base = f.kind === "scroll" ? (f.cfg.__framer__enter?.y || 0) : f.kind === "text" ? (f.cfg.effect?.effect?.y || 0) : null; if (base === null) continue;
      if (Math.abs(y - base - id / 10000) < 2e-6) { fx[u] = { id: +id, t, ...f }; break; } } }
  const hover = Object.values(FX).filter((f) => f.kind !== "scroll" && f.kind !== "text");
  fs.writeFileSync(out, JSON.stringify({ route, w: W, vh: VH, errs, rects, steps, log, dom, fx, text, textFx: Object.values(FX).filter((f) => f.kind === "text"), hover, FX, waapi, hovers, clicks }));
  console.log(route, W, "hovers", hovers.length, "clicks", clicks.length, "waapi", waapi.length, "uids", Object.keys(dom.o).length, "fx", Object.keys(fx).length, "text", Object.keys(text).length, "errs", errs.length);
  await b.close();
})();
