// Contact form: fill + submit on live replay and static, the submit request answered locally. node ftest.js <width> <200|500>
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path"); const { execSync } = require("child_process");
const { routeLive } = require("./live.js");
const [w, status = "200", root = "../static2"] = process.argv.slice(2); const W = +w, VH = W > 800 ? 900 : 844;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
const srv = http.createServer((q, r) => { let p = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; else if (!path.extname(p)) p += "/index.html"; fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }); r.end(d); }); });
const TIMES = [0, 60, 200, 500, 900, 1100, 1400, 2500];
async function run(b, url, live, tag) {
  const ctx = await b.newContext({ viewport: { width: W, height: VH } }); if (live) await routeLive(ctx);
  const posts = [];
  await ctx.route(/api\.(framer\.com|web3forms\.com)/, async (r) => { if (r.request().method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } }); posts.push(r.request().url()); await new Promise((x) => setTimeout(x, 800)); r.fulfill({ status: +status, contentType: "application/json", body: "{}", headers: { "access-control-allow-origin": "*" } }); });
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(3500);
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 250)); } document.querySelector("form").scrollIntoView({ block: "center" }); });
  await p.waitForTimeout(1500);
  const files = [];
  const shot = async (n) => { const f = `out/ft-${tag}-${n}.png`; await p.screenshot({ path: f }); files.push(f); };
  await shot("start");
  for (const [n, v] of Object.entries({ Ime: "Test", Email: "test@example.com", "Broj telefona": "091 000 000", Opis: "Test" })) { await p.click(`form [name="${n}"]`); await p.keyboard.type(v); }
  await p.selectOption("form select", { index: 1 }); await p.mouse.click(5, 5); await p.evaluate(() => [...document.querySelectorAll("form button[type=submit]")].find((x) => x.getBoundingClientRect().width > 0).scrollIntoView({ block: "center" })); await p.waitForTimeout(800); await shot("filled");
  const bb = await p.evaluate(() => { const e = [...document.querySelectorAll("form button[type=submit]")].find((x) => x.getBoundingClientRect().width > 0); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const t0 = Date.now(); await p.mouse.click(bb[0], bb[1]); await p.mouse.move(W - 2, 2);
  for (const t of TIMES) { const wait = t - (Date.now() - t0); if (wait > 0) await p.waitForTimeout(wait); await shot(t); }
  if (process.env.DUMP) console.log(tag, await p.evaluate(() => { const an = document.getAnimations().map((a) => (a.effect.target.getAttribute("data-framer-name") || a.effect.target.className) + " " + JSON.stringify(a.effect.getKeyframes()).slice(0, 200) + " " + a.playState); console.log(an); const e = [...document.querySelectorAll("form button[type=submit]")].find((x) => x.getBoundingClientRect().width > 0); return JSON.stringify(an) + e.outerHTML.slice(0, 100) + " BG " + getComputedStyle(e).backgroundColor; }));
  await ctx.close(); console.log(tag, "posts", posts); return files;
}
srv.listen(0, async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const A = await run(b, "https://termteam.hr/contact", true, "live");
  const B = await run(b, `http://localhost:${srv.address().port}/contact`, false, "ours");
  await b.close(); srv.close();
  for (let i = 0; i < Math.min(A.length, B.length); i++) { const o = execSync(`python3 diff.py ${A[i]} ${B[i]} ${A[i].replace("-live-", "-diff-")}`).toString().trim().split("\n"); console.log(path.basename(A[i]), o[o.length - 1].slice(0, 60)); }
});
