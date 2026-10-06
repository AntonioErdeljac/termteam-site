// Click a fixed pseudo-random sequence of targets on live replay and static; diff the settled result after each click.
// node seqtest.js <route> <width> <selector> [count] [seed]
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path"); const { execSync } = require("child_process");
const { routeLive } = require("./live.js");
const [route, w, sel, count = "12", seed = "7", root = "../static2"] = process.argv.slice(2); const W = +w, VH = W > 800 ? 900 : 844;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; else if (!path.extname(p)) p += "/index.html"; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(d); }); });
let s = +seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
async function run(b, url, live, tag, picks) {
  const ctx = await b.newContext({ viewport: { width: W, height: VH } }); if (live) await routeLive(ctx);
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(3500);
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } });
  await p.evaluate((sel) => document.querySelector(sel).scrollIntoView({ block: "center" }), sel); await p.waitForTimeout(1500);
  const n = await p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).length, sel);
  if (!picks.length) for (let i = 0; i < +count; i++) picks.push(Math.floor(rnd() * n));
  const files = [];
  for (let i = 0; i < picks.length; i++) {
    const bb = await p.evaluate(([sel, k]) => { const e = [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0)[k]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [sel, picks[i]]);
    if (!bb) { console.log(tag, "missing pick", picks[i]); continue; }
    await p.mouse.click(bb[0], bb[1]); await p.mouse.move(W - 2, VH - 2); await p.waitForTimeout(1800);
    const f = `out/seq-${tag}-${i}.png`; await p.screenshot({ path: f }); files.push(f);
  }
  await ctx.close(); return [files, n];
}
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" }); const picks = [];
  const [A, n] = await run(b, "https://termteam.hr" + route, true, "live", picks);
  const [B] = await run(b, `http://localhost:${srv.address().port}${route}`, false, "ours", picks);
  await b.close(); srv.close(); console.log("targets", n, "picks", picks.join(","));
  for (let i = 0; i < Math.min(A.length, B.length); i++) { const o = execSync(`python3 diff.py ${A[i]} ${B[i]} ${A[i].replace("-live-", "-diff-")}`).toString().trim().split("\n"); console.log(i, picks[i], o[o.length - 1].slice(0, 60)); }
});
