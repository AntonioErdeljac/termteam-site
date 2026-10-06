// Interaction test: hover / click the same element on live replay and static, capture frames, diff.
// node itest.js <route> <width> <hover|click> <css selector> [nth] [name]
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path"); const { execSync } = require("child_process");
const { routeLive } = require("./live.js");
const [route, w, kind, sel, nth = "0", name = "it", root = "../static2"] = process.argv.slice(2); const W = +w, VH = W > 800 ? 900 : 844;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; else if (!path.extname(p)) p += "/index.html"; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(d); }); });
const TIMES = [0, 60, 120, 200, 320, 500, 1200];
async function run(b, url, live, tag) {
  const ctx = await b.newContext({ viewport: { width: W, height: VH } }); if (live) await routeLive(ctx);
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(3500);
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } });
  const box = await p.evaluate(([sel, nth]) => { const e = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)[+nth]; if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, [sel, nth]);
  if (!box) { console.log(tag, "not found"); await ctx.close(); return []; }
  await p.mouse.move(W - 2, VH - 2); await p.waitForTimeout(1500);
  const clip = { x: Math.max(0, box[0] - 40), y: Math.max(0, box[1] - 40), width: Math.min(W - Math.max(0, box[0] - 40), box[2] + 80), height: Math.min(VH - Math.max(0, box[1] - 40), box[3] + (kind === "click" ? 400 : 80)) };
  if (process.env.FULL) { clip.x = 0; clip.y = 0; clip.width = W; clip.height = VH; }
  const files = []; const t0 = Date.now();
  if (kind === "hover") await p.mouse.move(box[0] + box[2] / 2, box[1] + box[3] / 2); else await p.mouse.click(box[0] + box[2] / 2, box[1] + box[3] / 2);
  for (const t of TIMES) { const wait = t - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait); const f = `out/it-${name}-${tag}-${t}.png`; await p.screenshot({ path: f, clip }); files.push(f); }
  if (kind === "click" && process.env.TWICE) { await p.mouse.move(W - 2, VH - 2); const b2 = await p.evaluate(([sel, nth]) => { const e = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0)[+nth]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }, [process.env.TWICE === "1" ? sel : process.env.TWICE, process.env.NTH2 || nth]); if (b2) { const t1 = Date.now(); await p.mouse.click(b2[0] + b2[2] / 2, b2[1] + b2[3] / 2); for (const t of TIMES) { const wait = t - (Date.now() - t1); if (wait > 0) await p.waitForTimeout(wait); const f = `out/it-${name}-${tag}-b${t}.png`; await p.screenshot({ path: f, clip }); files.push(f); } } }
  if (kind === "hover") { await p.mouse.move(W - 2, VH - 2); await p.waitForTimeout(1200); const f = `out/it-${name}-${tag}-out.png`; await p.screenshot({ path: f, clip }); files.push(f); }
  await ctx.close(); return files;
}
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const A = await run(b, "https://termteam.hr" + route, true, "live");
  const B = process.env.LIVE2 ? await run(b, "https://termteam.hr" + route, true, "ours") : await run(b, `http://localhost:${srv.address().port}${route}`, false, "ours");
  await b.close(); srv.close();
  for (let i = 0; i < Math.min(A.length, B.length); i++) { const o = execSync(`python3 diff.py ${A[i]} ${B[i]} ${A[i].replace("-live-", "-diff-")}`).toString().trim().split("\n"); console.log(path.basename(A[i]), o[o.length - 1].slice(0, 60)); }
});
