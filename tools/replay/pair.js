// Screenshot the live replay and the static build the same way, then diff.  node pair.js <route> <width> [staticRoot]
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path"); const { execSync } = require("child_process");
const { routeLive, slug } = require("./live.js");
const [route, w, root = "../static2"] = process.argv.slice(2); const W = +w, VH = W > 800 ? 900 : 844;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; else if (!path.extname(p)) p += "/index.html"; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(d); }); });
async function shoot(b, url, live, out) {
  const ctx = await b.newContext({ viewport: { width: W, height: VH } }); if (live) await routeLive(ctx);
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(4000);
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 250) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 350)); } scrollTo(0, 0); });
  await p.waitForTimeout(3000);
  await p.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect && a.effect.getTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; } }));
  await p.waitForTimeout(300);
  if (process.env.PROBE2) console.log(live ? "LIVE" : "OURS", await p.evaluate((t) => { const e = [...document.querySelectorAll("p,span,div")].find((x) => x.children.length === 0 && x.textContent.trim() === t); const out = []; let c = e; while (c && c !== document.body) { const r = c.getBoundingClientRect(); out.push(c.tagName + "." + (c.className.baseVal ?? c.className).toString().slice(0, 30) + " top=" + r.top.toFixed(3) + " h=" + r.height.toFixed(3) + " tf=" + getComputedStyle(c).transform + " wc=" + getComputedStyle(c).willChange + " op=" + getComputedStyle(c).opacity); c = c.parentElement; } return out.join("\n"); }, process.env.PROBE2));
  if (process.env.PROBE) console.log(live ? "LIVE" : "OURS", await p.evaluate((t) => { const e = [...document.querySelectorAll("h1,h2,h3,p,span")].find((x) => x.textContent.trim().startsWith(t)); if (!e) return "none"; let c = e.closest("[data-framer-component-type]") || e; return c.outerHTML.slice(0, 1500) + "\n PARENT-STYLES: " + [c.parentElement, c.parentElement.parentElement, c.parentElement.parentElement.parentElement].map((x) => x.getAttribute("style")).join(" || "); }, process.env.PROBE));
  await p.screenshot({ path: out, fullPage: true }); await ctx.close();
}
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const s = slug(route); const A = `out/pair-${s}-${W}-live.png`, B = `out/pair-${s}-${W}-ours.png`;
  await shoot(b, "https://termteam.hr" + route, true, A);
  await shoot(b, `http://localhost:${srv.address().port}${route}`, false, B);
  await b.close(); srv.close();
  console.log(execSync(`python3 diff.py ${A} ${B} out/pair-${s}-${W}-diff.png`).toString().trim().split("\n").slice(-2).join("\n"));
});
