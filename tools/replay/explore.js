// Explore click state machines exhaustively: for every state a click group can reach, click every
// trigger that is actually hittable there, and log the mutations. Seeds triggers from a harvest file.
// node explore.js <route> <width> <harvest.json> <out.json>
const { chromium } = require("playwright"); const fs = require("fs");
const { routeLive } = require("./live.js");
const { groupsOf } = require("./groups.js");
const [route, w, hfile, out] = process.argv.slice(2); const W = +w, VH = W > 800 ? 900 : 844;
const H = JSON.parse(fs.readFileSync(hfile, "utf8"));
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: W, height: VH } }); await routeLive(ctx, { tag: true });
  const p = await ctx.newPage(); await p.goto("https://termteam.hr" + route, { waitUntil: "load" }); await p.waitForTimeout(5000);
  const Hh = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 100; y < Hh + 100; y += 300) { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(400); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1500);
  await p.evaluate(() => { let n = 0; document.querySelectorAll("#main *").forEach((e) => { if (!e.hasAttribute("data-uid")) e.setAttribute("data-ruid", "r" + n++); });
    window.__hl = []; window.__ht0 = performance.now(); let hn = 0;
    const idOf = (e) => e && e.nodeType === 1 ? (e.getAttribute("data-uid") || e.getAttribute("data-ruid") || e.getAttribute("data-hn")) : null;
    new MutationObserver((ms) => { const t = Math.round((performance.now() - window.__ht0) * 10) / 10;
      for (const m of ms) {
        if (m.type === "attributes") { const u = idOf(m.target); if (u) window.__hl.push([t, u, m.attributeName, m.target.getAttribute(m.attributeName), m.oldValue]); }
        else { for (const n of m.addedNodes) { if (n.nodeType !== 1) continue; [n, ...n.querySelectorAll("*")].forEach((x) => { if (!idOf(x)) x.setAttribute("data-hn", "h" + hn++); });
            window.__hl.push([t, idOf(n), "add", n.outerHTML, idOf(m.target), idOf(n.nextElementSibling)]); }
          for (const n of m.removedNodes) if (n.nodeType === 1) window.__hl.push([t, idOf(n), "remove", null, idOf(m.target)]); }
      } }).observe(document.body, { attributes: true, subtree: true, attributeOldValue: true, childList: true });
    window.__anims = () => document.getAnimations().map((a) => { const e = a.effect && a.effect.target; const u = idOf(e); if (!u) return null; const tm = a.effect.getTiming(); return { id: u, css: !!a.animationName, t: a.currentTime, kf: a.effect.getKeyframes().map((k) => { const o = {}; for (const x in k) if (!["computedOffset", "composite"].includes(x) && k[x] !== "auto") o[x] = k[x]; return o; }), timing: { duration: tm.duration, easing: tm.easing, delay: tm.delay, iterations: String(tm.iterations) } }; }).filter(Boolean);
  });
  const now = () => p.evaluate(() => Math.round((performance.now() - window.__ht0) * 10) / 10);
  // a point inside the trigger where a real click would land on it (not covered, not clipped)
  const hit = (id) => p.evaluate((id) => { const e = document.querySelector(`[data-uid="${id}"],[data-ruid="${id}"],[data-hn="${id}"]`); if (!e) return null;
    let r = e.getBoundingClientRect(); if (!r.width) return null; if (r.top < 0 || r.bottom > innerHeight) { e.scrollIntoView({ block: "center" }); r = e.getBoundingClientRect(); }
    for (const [fx, fy] of [[.5, .5], [.3, .5], [.7, .5], [.5, .3], [.5, .7], [.2, .2], [.8, .8]]) { const x = r.left + r.width * fx, y = r.top + r.height * fy; const t = document.elementFromPoint(x, y); if (t && (t === e || e.contains(t))) return [x, y]; }
    return null; }, id);
  const groups = groupsOf(H.clicks || []);
  const clicks = []; let budget = 260;
  const sig = (slots) => p.evaluate((slots) => JSON.stringify(slots.map(([id, a]) => { const e = document.querySelector(`[data-uid="${id}"],[data-ruid="${id}"]`); return e ? e.getAttribute(a) : null; })), slots);
  // siblings of a trigger (same component class) are triggers too, even if clicking them did nothing from the base state
  for (const g of groups) g.triggers = await p.evaluate((ids) => { const out = new Set(ids); for (const id of ids) { const e = document.querySelector(`[data-uid="${id}"],[data-ruid="${id}"]`); if (!e) continue; const c = e.classList[0]; if (!c) continue; document.querySelectorAll("." + CSS.escape(c)).forEach((x) => { const u = x.getAttribute("data-uid") || x.getAttribute("data-ruid"); if (u && !x.closest("a")) out.add(u); }); } return [...out]; }, g.triggers);
  for (const g of groups) {
    const slots = g.attrSlots.filter(([, a]) => a === "class" || a === "data-framer-name" || a === "aria-expanded");
    const edges = {}; const seen = new Set();
    let cur = await sig(slots); seen.add(cur);
    const pathTo = (from, to) => { const prev = { [from]: null }; const q = [from]; while (q.length) { const s = q.shift(); if (s === to) break; for (const [tr, d] of Object.entries(edges[s] || {})) if (!(d in prev)) { prev[d] = [s, tr]; q.push(d); } } if (!(to in prev)) return null; const path = []; let s = to; while (prev[s]) { path.unshift(prev[s][1]); s = prev[s][0]; } return path; };
    const click = async (id) => { const pt = await hit(id); if (!pt) return false; await p.waitForTimeout(300); const pt2 = await hit(id); if (!pt2) return false;
      await p.evaluate(() => { window.__hl = []; }); const t0 = await now(); await p.mouse.click(pt2[0], pt2[1]); await p.mouse.move(W - 2, 2); await p.waitForTimeout(40); const a1 = await p.evaluate(() => window.__anims()); await p.waitForTimeout(1700); const t1 = await now();
      clicks.push({ id, t0, t1, log: await p.evaluate(() => window.__hl), a1, a2: [], explore: true }); budget--; return true; };
    // keep sweeping until every (state, trigger) pair is tried or no state can be reached any more
    const tried = new Set(); let progress = true;
    while (progress && budget > 0) {
      progress = false;
      for (const s of [...seen]) for (const id of g.triggers) {
        if (budget <= 0 || tried.has(s + "#" + id)) continue;
        if (cur !== s) { const path = pathTo(cur, s); if (!path) continue; for (const tr of path) { await click(tr); cur = await sig(slots); } if (cur !== s) continue; }
        tried.add(s + "#" + id); progress = true;
        if (!(await click(id))) continue;
        const d = await sig(slots); (edges[s] ||= {})[id] = d; cur = d; seen.add(d);
      }
    }
    console.log(route, W, "group", g.triggers.join(","), "states", seen.size);
  }
  fs.writeFileSync(out, JSON.stringify({ route, w: W, clicks }));
  console.log(route, W, "explore clicks", clicks.length, "budget left", budget);
  await b.close();
})();
