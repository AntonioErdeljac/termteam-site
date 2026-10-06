// Second pass: rendered DOM per breakpoint + interaction captures.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const BASE = "https://termteam.hr";
const PAGES = ["/", "/about-us", "/services", "/gallery", "/contact",
  "/services/podno-grijanje", "/services/dizalica-topline", "/services/grijanje-i-toplinska-rjesenja",
  "/services/vodoinstalaterske-usluge", "/services/hladenje-i-klimatizacija", "/services/fan-coileri"];
const BPS = { desktop: 1440, tablet: 1000, phone: 390 };
const OUT = "capture";
const slug = (p) => (p === "/" ? "home" : p.slice(1).replace(/\//g, "__"));
const browser = await chromium.launch();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(w, url) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w > 800 ? 900 : 844 } });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  return { ctx, page };
}
async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 150)); }
    scrollTo(0, 0); await new Promise((r) => setTimeout(r, 800));
  });
}

// 1) rendered DOM per breakpoint
for (const p of PAGES) {
  for (const [bp, w] of Object.entries(BPS)) {
    const { ctx, page } = await open(w, BASE + p);
    await scrollThrough(page); await sleep(1500);
    await writeFile(`${OUT}/${slug(p)}/rendered-${bp}.html`, await page.content());
    await ctx.close();
  }
}

// 2) motion timeline: sample inline opacity/transform of every animated element while scrolling in steps
for (const p of ["/", "/about-us", "/services", "/gallery", "/contact", "/services/podno-grijanje"]) {
  for (const w of [1440, 390]) {
    const { ctx, page } = await open(w, BASE + p);
    const log = await page.evaluate(async () => {
      const els = [...document.querySelectorAll("[style]")].filter((e) => /opacity|transform/.test(e.getAttribute("style")));
      const path = (e) => { const a = []; while (e && e !== document.body) { a.unshift(e.tagName.toLowerCase() + "." + [...e.classList].filter(c => c.startsWith("framer-")).join(".")); e = e.parentElement; } return a.join(">"); };
      const ids = els.map((e, i) => ({ i, path: path(e), cls: e.className, name: e.dataset.framerName || "", text: (e.textContent || "").trim().slice(0, 40) }));
      const frames = []; const t0 = performance.now(); let running = true;
      const sample = () => { if (!running) return; frames.push([Math.round(performance.now() - t0), Math.round(scrollY), els.map((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return [ +(+cs.opacity).toFixed(3), cs.transform, Math.round(r.top), Math.round(r.height)]; })]); requestAnimationFrame(sample); };
      requestAnimationFrame(sample);
      await new Promise((r) => setTimeout(r, 2500));
      const steps = [];
      for (let y = 300; y < document.body.scrollHeight; y += 300) { steps.push([Math.round(performance.now() - t0), y]); scrollTo(0, y); await new Promise((r) => setTimeout(r, 1800)); }
      running = false;
      return { ids, steps, frames: frames.filter((f, i) => i % 1 === 0) };
    });
    await writeFile(`${OUT}/${slug(p)}/motion-${w}.json`, JSON.stringify(log));
    await ctx.close();
  }
}

// 3) interactions (frames)
async function frames(page, dir, n, every, clip) { for (let i = 0; i < n; i++) { await page.screenshot({ path: `${dir}-${String(i).padStart(2, "0")}.png`, clip }); await sleep(every); } }
await mkdir(`${OUT}/interact`, { recursive: true });
{
  const { ctx, page } = await open(1440, BASE + "/"); await scrollThrough(page);
  // hovers
  for (const [name, sel] of [["nav-onama", "text=O nama"], ["btn-kontakt", "a:has-text('Kontakt') >> nth=0"], ["btn-hero", "text=Pogledajte naše usluge"], ["card", "text=Podno grijanje >> nth=0"], ["phone", "text=+385 91 585 9565 >> nth=0"]]) {
    try { const el = page.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await sleep(800); const box = await el.boundingBox();
      const clip = { x: Math.max(0, box.x - 60), y: Math.max(0, box.y - 60), width: Math.min(box.width + 120, 1440), height: box.height + 120 };
      await page.mouse.move(5, 5); await sleep(400); await page.screenshot({ path: `${OUT}/interact/${name}-rest.png`, clip });
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await frames(page, `${OUT}/interact/${name}-hover`, 8, 60, clip);
    } catch (e) { console.log("hover fail", name, e.message); }
  }
  // FAQ
  try { const q = page.locator("text=Može li dizalica topline raditi na radijatore?").first(); await q.scrollIntoViewIfNeeded(); await sleep(800);
    const box = await page.locator("text=Česta pitanja").first().boundingBox(); const clip = { x: 0, y: box.y - 40, width: 1440, height: 800 };
    await q.click(); await frames(page, `${OUT}/interact/faq-click`, 14, 40, clip);
  } catch (e) { console.log("faq fail", e.message); }
  // ticker speed
  try { const t = page.locator("text=Korina S.").first(); await t.scrollIntoViewIfNeeded(); await sleep(500);
    const pos = []; for (let i = 0; i < 6; i++) { pos.push(await page.evaluate(() => [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "Korina S.").map(e => Math.round(e.getBoundingClientRect().left)))); await sleep(1000); }
    await writeFile(`${OUT}/interact/ticker-positions.json`, JSON.stringify(pos));
    const box = await t.boundingBox(); await page.mouse.move(box.x, box.y); await sleep(300);
    const hp = []; for (let i = 0; i < 3; i++) { hp.push(await page.evaluate(() => [...document.querySelectorAll("*")].filter(e => e.children.length === 0 && e.textContent.trim() === "Korina S.").map(e => Math.round(e.getBoundingClientRect().left)))); await sleep(1000); }
    await writeFile(`${OUT}/interact/ticker-hover-positions.json`, JSON.stringify(hp));
  } catch (e) { console.log("ticker fail", e.message); }
  await ctx.close();
}
{ // gallery slideshow
  const { ctx, page } = await open(1440, BASE + "/gallery"); await sleep(1000);
  const clip = { x: 0, y: 450, width: 1440, height: 650 };
  await frames(page, `${OUT}/interact/gallery-idle`, 16, 500, clip);
  try { await page.mouse.move(720, 700); await frames(page, `${OUT}/interact/gallery-hover`, 6, 300, clip); } catch {}
  try { const th = page.locator("[data-framer-name='Thumbnails'] img, [data-framer-name='Selector'] img").nth(3); await th.click(); await frames(page, `${OUT}/interact/gallery-thumb`, 12, 50, clip); } catch (e) { console.log("thumb fail", e.message); }
  await ctx.close();
}
{ // mobile menu
  const { ctx, page } = await open(390, BASE + "/"); await sleep(1500);
  try { await page.locator("[data-framer-name='Phone Nav Toggle']").first().click(); await frames(page, `${OUT}/interact/mobilemenu-open`, 12, 50); 
    await page.screenshot({ path: `${OUT}/interact/mobilemenu-open-full.png`, fullPage: false });
    await writeFile(`${OUT}/interact/mobilemenu-open.html`, await page.content());
  } catch (e) { console.log("menu fail", e.message); }
  await ctx.close();
}
{ // header on scroll
  const { ctx, page } = await open(1440, BASE + "/"); await sleep(1500);
  for (const y of [0, 100, 400, 1200]) { await page.evaluate((y) => scrollTo(0, y), y); await sleep(900); await page.screenshot({ path: `${OUT}/interact/header-scroll-${y}.png`, clip: { x: 0, y: 0, width: 1440, height: 130 } }); }
  await ctx.close();
}
{ // contact form focus/submit look
  const { ctx, page } = await open(1440, BASE + "/contact"); await sleep(1500);
  try { const inp = page.locator("input").first(); await inp.scrollIntoViewIfNeeded(); const box = await page.locator("form").first().boundingBox(); const clip = { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 };
    await page.screenshot({ path: `${OUT}/interact/form-rest.png`, clip }); await inp.click(); await sleep(400); await page.screenshot({ path: `${OUT}/interact/form-focus.png`, clip });
    await page.locator("select").first().selectOption({ index: 1 }).catch(() => {}); await sleep(300); await page.screenshot({ path: `${OUT}/interact/form-select.png`, clip });
    await page.locator("button, input[type=submit]").last().hover(); await sleep(400); await page.screenshot({ path: `${OUT}/interact/form-btn-hover.png`, clip });
    await writeFile(`${OUT}/interact/form.html`, await page.locator("form").first().evaluate((f) => f.outerHTML));
  } catch (e) { console.log("form fail", e.message); }
  await ctx.close();
}
await browser.close();
console.log("done");
