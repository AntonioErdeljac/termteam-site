// Captures the live Framer site: raw SSR HTML, rendered DOM, screenshots, motion frames, assets.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://termteam.hr";
const PAGES = ["/", "/about-us", "/services", "/gallery", "/contact",
  "/services/podno-grijanje", "/services/dizalica-topline", "/services/grijanje-i-toplinska-rjesenja",
  "/services/vodoinstalaterske-usluge", "/services/hladenje-i-klimatizacija", "/services/fan-coileri"];
const WIDTHS = [1440, 1200, 810, 390];
const OUT = "capture";
const slug = (p) => (p === "/" ? "home" : p.slice(1).replace(/\//g, "__"));
const assets = new Set();

await mkdir(`${OUT}/assets`, { recursive: true });
const browser = await chromium.launch();

async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = 300;
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0); await new Promise((r) => setTimeout(r, 600));
  });
}

for (const p of PAGES) {
  const s = slug(p);
  await mkdir(`${OUT}/${s}`, { recursive: true });
  const raw = await (await fetch(BASE + p)).text();
  await writeFile(`${OUT}/${s}/ssr.html`, raw);
  for (const m of raw.matchAll(/https:\/\/framerusercontent\.com\/[^"'\s)\\]+/g)) assets.add(m[0].replace(/&amp;/g, "&"));

  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 }, deviceScaleFactor: 1,
      recordVideo: p === "/" || p === "/about-us" || p === "/gallery" || p === "/services/podno-grijanje" ? { dir: `${OUT}/${s}/video-${w}`, size: { width: Math.min(w, 1440), height: w > 800 ? 900 : 844 } } : undefined });
    const page = await ctx.newPage();
    page.on("request", (r) => { const u = r.url(); if (u.includes("framerusercontent.com")) assets.add(u); });
    await page.goto(BASE + p, { waitUntil: "load" });
    // motion frames of first viewport during the load animation
    if (w === 1440 || w === 390) for (const t of [0, 100, 200, 300, 400, 500, 600, 800, 1000, 1300, 1700, 2200]) {
      await page.screenshot({ path: `${OUT}/${s}/load-${w}-${String(t).padStart(4, "0")}.png` });
      await page.waitForTimeout(t === 0 ? 100 : 100);
    }
    await page.waitForLoadState("networkidle");
    await scrollThrough(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${s}/full-${w}.png`, fullPage: true });
    if (w === 1440) await writeFile(`${OUT}/${s}/rendered.html`, await page.content());
    await ctx.close();
  }
}
await browser.close();

const list = [...assets].filter((u) => !/\.(jpe?g|png|webp)(\?|$)/i.test(u) || u.includes("scale-down") === false);
let i = 0;
for (const u of list) {
  try {
    const res = await fetch(u); if (!res.ok) continue;
    const name = u.replace("https://framerusercontent.com/", "").replace(/[?&=]/g, "_");
    const path = `${OUT}/assets/${name}`;
    await mkdir(path.split("/").slice(0, -1).join("/"), { recursive: true });
    await writeFile(path, Buffer.from(await res.arrayBuffer())); i++;
  } catch {}
}
await writeFile(`${OUT}/assets.txt`, [...assets].sort().join("\n"));
console.log("pages", PAGES.length, "assets", i);
