// Record every network response the live site makes, so it can be replayed offline as a reference.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const PAGES = ["/", "/about-us", "/services", "/gallery", "/contact", "/404-test",
  "/services/podno-grijanje", "/services/dizalica-topline", "/services/grijanje-i-toplinska-rjesenja",
  "/services/vodoinstalaterske-usluge", "/services/hladenje-i-klimatizacija", "/services/fan-coileri"];
const OUT = "capture/net"; await mkdir(OUT, { recursive: true });
const index = {};
const browser = await chromium.launch();
for (const w of [1440, 1000, 390]) for (const p of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("response", async (r) => {
    const u = r.url(); if (index[u] || u.startsWith("data:")) return;
    try { const body = await r.body(); const h = createHash("md5").update(u).digest("hex");
      index[u] = { file: h, status: r.status(), type: r.headers()["content-type"] || "" }; await writeFile(`${OUT}/${h}`, body); } catch {}
  });
  await page.goto("https://termteam.hr" + p, { waitUntil: "networkidle" }).catch(() => {});
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 250) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } }).catch(() => {});
  // open interactive bits to trigger lazy modules
  await page.mouse.move(w / 2, 300); await page.waitForTimeout(1500);
  await ctx.close();
}
await writeFile(`${OUT}/index.json`, JSON.stringify(index, null, 1));
await browser.close();
console.log(Object.keys(index).length, "responses");
