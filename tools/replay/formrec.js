// Record Framer's contact form behaviour on the offline replay. The submit request is answered
// locally by this script (never reaches Framer), once with success and once with an error.
// node formrec.js <width> <out.json>
const { chromium } = require("playwright"); const fs = require("fs"); const { routeLive } = require("./live.js");
const [w, out] = process.argv.slice(2); const W = +w;
async function session(b, status) {
  const ctx = await b.newContext({ viewport: { width: W, height: W > 800 ? 900 : 844 } }); await routeLive(ctx, { tag: true });
  const posts = [];
  await ctx.route("https://api.framer.com/**", async (r) => { posts.push([r.request().method(), r.request().url(), r.request().headers()["content-type"], r.request().postData()]); await new Promise((x) => setTimeout(x, 800)); r.fulfill({ status, contentType: "application/json", body: status === 200 ? "{}" : '{"error":"x"}', headers: { "access-control-allow-origin": "*" } }); });
  const p = await ctx.newPage(); await p.goto("https://termteam.hr/contact", { waitUntil: "load" }); await p.waitForTimeout(4000);
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 300)); } });
  await p.evaluate(() => { let n = 0; document.querySelectorAll("#main *").forEach((e) => { if (!e.hasAttribute("data-uid")) e.setAttribute("data-ruid", "r" + n++); });
    window.__hl = []; window.__ht0 = performance.now(); let hn = 0;
    const idOf = (e) => e && e.nodeType === 1 ? (e.getAttribute("data-uid") || e.getAttribute("data-ruid") || e.getAttribute("data-hn")) : null;
    new MutationObserver((ms) => { const t = Math.round((performance.now() - window.__ht0) * 10) / 10;
      for (const m of ms) {
        if (m.type === "attributes") { const u = idOf(m.target); if (u) window.__hl.push([t, u, m.attributeName, m.target.getAttribute(m.attributeName), m.oldValue]); }
        else { for (const n of m.addedNodes) { if (n.nodeType !== 1) { if (n.nodeType === 3) window.__hl.push([t, idOf(m.target), "text", m.target.textContent]); continue; } [n, ...n.querySelectorAll("*")].forEach((x) => { if (!idOf(x)) x.setAttribute("data-hn", "h" + hn++); });
            window.__hl.push([t, idOf(n), "add", n.outerHTML, idOf(m.target), idOf(n.nextElementSibling)]); }
          for (const n of m.removedNodes) if (n.nodeType === 1) window.__hl.push([t, idOf(n), "remove", null, idOf(m.target)]); }
      } }).observe(document.body, { attributes: true, subtree: true, attributeOldValue: true, childList: true, characterData: true });
    window.__anims = () => document.getAnimations().map((a) => { const e = a.effect && a.effect.target; const u = idOf(e); if (!u) return null; const tm = a.effect.getTiming(); return { id: u, css: !!a.animationName, t: a.currentTime, kf: a.effect.getKeyframes().map((k) => { const o = {}; for (const x in k) if (!["computedOffset", "composite"].includes(x) && k[x] !== "auto") o[x] = k[x]; return o; }), timing: { duration: tm.duration, easing: tm.easing, delay: tm.delay, iterations: String(tm.iterations) } }; }).filter(Boolean);
  });
  const now = () => p.evaluate(() => Math.round((performance.now() - window.__ht0) * 10) / 10);
  const marks = {};
  const form = "form"; await p.evaluate(() => document.querySelector("form").scrollIntoView({ block: "center" })); await p.waitForTimeout(800);
  // 1) submit empty: native validation, Framer marks fields
  marks.empty0 = await now(); await p.click(`${form} button[type=submit]`); await p.waitForTimeout(1500); marks.empty1 = await now();
  // 2) typing / focus per field
  const vals = { Ime: "Test", Email: "test@example.com", "Broj telefona": "091 000 000", Opis: "Test" };
  for (const [n, v] of Object.entries(vals)) { marks["f" + n] = await now(); await p.click(`${form} [name="${n}"]`); await p.waitForTimeout(500); await p.keyboard.type(v, { delay: 30 }); await p.waitForTimeout(500); }
  marks.sel = await now(); await p.selectOption(`${form} select`, { index: 1 }); await p.waitForTimeout(600);
  marks.blur = await now(); await p.mouse.click(5, 5); await p.waitForTimeout(600);
  marks.submit = await now(); await p.click(`${form} button[type=submit]`); await p.mouse.move(W - 2, 2); await p.waitForTimeout(40); const a1 = await p.evaluate(() => window.__anims());
  await p.waitForTimeout(3500); marks.end = await now(); const a2 = await p.evaluate(() => window.__anims());
  const log = await p.evaluate(() => window.__hl);
  const values = await p.evaluate(() => [...document.querySelectorAll("form input,form textarea,form select")].map((e) => [e.name, e.value]));
  await ctx.close();
  return { status, marks, log, a1, a2, posts, values };
}
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ok = await session(b, 200), err = await session(b, 500);
  await b.close();
  fs.writeFileSync(out, JSON.stringify({ w: W, ok, err }));
  for (const s of [ok, err]) console.log(W, s.status, "log", s.log.length, "posts", JSON.stringify(s.posts).slice(0, 300), "values", JSON.stringify(s.values));
})();
