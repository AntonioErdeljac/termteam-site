// Replay the captured live site locally (real Framer runtime, captured assets).
// node live.js <route> <width> <out.png> [height]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const CAP = path.join(__dirname, "../../capture");
const slug = (p) => (p === "/" ? "home" : p.replace(/^\//, "").replace(/\/$/, "").replace(/\//g, "__"));
const missing = new Set();
let NET = null; try { NET = JSON.parse(fs.readFileSync(`${CAP}/net/index.json`)); } catch {}
const TAG = `<script>(function(){var n=0;document.querySelectorAll("#main *").forEach(function(e){e.setAttribute("data-uid",n++)})})()</script>`;
const FXMAP = {}; let FXC = 1; const FXN = (mod, k, n) => { const id = FXC++; FXMAP[id] = `${mod}:${k}${n}`; return id; };
async function routeLive(ctx, opts = {}) {
  await ctx.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === "termteam.hr" && opts.tag) {
      const f = `${CAP}/${slug(u.pathname)}/ssr.html`;
      if (fs.existsSync(f)) { let h = fs.readFileSync(f, "utf8"); const i = h.indexOf("<script", h.indexOf("<div id=\"main\"")); h = h.slice(0, i) + TAG + h.slice(i);
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: h }); }
    }
    if (NET && NET[u.href] && u.hostname !== "termteam.hr" && !(opts.fx && /\/sites\/.*\.mjs$/.test(u.pathname))) { const e = NET[u.href]; return route.fulfill({ status: e.status, contentType: e.type, body: fs.readFileSync(`${CAP}/net/${e.file}`), headers: { "access-control-allow-origin": "*" } }); }
    if (u.hostname === "termteam.hr") {
      const f = `${CAP}/${slug(u.pathname)}/ssr.html`;
      if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: fs.readFileSync(f) });
      return route.fulfill({ status: 404, body: "" });
    }
    if (u.hostname === "framerusercontent.com") {
      const name = (u.pathname.slice(1) + (u.search ? u.search : "")).replace(/[?&=]/g, "_");
      let f = `${CAP}/assets/${name}`;
      if (!fs.existsSync(f)) { f = `${CAP}/assets/${u.pathname.slice(1)}`; }
      if (!fs.existsSync(f) && u.pathname.startsWith("/images/")) { const id = path.basename(u.pathname); const c = fs.readdirSync(`${CAP}/assets/images`).filter(x => x.startsWith(id)).map(x => `${CAP}/assets/images/${x}`).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size); if (c[0]) f = c[0]; }
      if (!fs.existsSync(f) && NET && NET[u.href] && NET[u.href].status === 200) f = `${CAP}/net/${NET[u.href].file}`;
      if (fs.existsSync(f) && opts.fx && /\/sites\/.*\.mjs$/.test(u.pathname)) { let js = fs.readFileSync(f, "utf8"); let n = 0; const mod = path.basename(u.pathname).split(".")[0]; if (process.env.DBG) console.log("fx", mod);
        js = require("./instrument.js").instrument(js, mod);
        return route.fulfill({ status: 200, contentType: "application/javascript", body: js, headers: { "access-control-allow-origin": "*" } }); }
      if (fs.existsSync(f)) { const ext = path.extname(u.pathname); const ct = { ".mjs": "application/javascript", ".js": "application/javascript", ".woff2": "font/woff2", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" }[ext] || "application/octet-stream"; return route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f), headers: { "access-control-allow-origin": "*" } }); }
      missing.add(u.href); return route.fulfill({ status: 404, body: "" });
    }
    if (u.hostname === "fonts.gstatic.com" || u.hostname === "localhost" || u.hostname === "127.0.0.1") return route.continue();
    missing.add(u.href); return route.abort();
  });
}
module.exports = { FXMAP, routeLive, missing, slug };
if (require.main === module) (async () => {
  const [route, w, out] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await b.newContext({ viewport: { width: +w, height: +w > 800 ? 900 : 844 } });
  await routeLive(ctx);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto("https://termteam.hr" + route, { waitUntil: "networkidle" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); await new Promise(r => setTimeout(r, 1500)); });
  await p.screenshot({ path: out, fullPage: true });
  console.log("svgs", await p.evaluate(() => document.querySelectorAll("svg").length), "errors", errs.slice(0, 5), "missing", [...missing].slice(0, 10));
  await b.close();
})();
