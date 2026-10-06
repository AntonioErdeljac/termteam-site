// Download every image URL (all srcset sizes) referenced by the captured SSR pages.
import { readFile, writeFile, mkdir, readdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
const OUT = "capture/net"; await mkdir(OUT, { recursive: true });
const index = JSON.parse(await readFile(`${OUT}/index.json`, "utf8"));
const urls = new Set();
for (const d of await readdir("capture")) {
  const f = `capture/${d}/ssr.html`; try { await access(f); } catch { continue; }
  const s = (await readFile(f, "utf8")).replace(/&amp;/g, "&");
  for (const m of s.matchAll(/https:\/\/framerusercontent\.com\/images\/[^"'\s,)]+/g)) urls.add(m[0]);
}
let n = 0;
for (const u of urls) {
  if (index[u]) continue;
  const r = await fetch(u); if (!r.ok) { console.log(r.status, u); continue; }
  const h = createHash("md5").update(u).digest("hex");
  await writeFile(`${OUT}/${h}`, Buffer.from(await r.arrayBuffer()));
  index[u] = { file: h, status: 200, type: r.headers.get("content-type") || "" }; n++;
}
await writeFile(`${OUT}/index.json`, JSON.stringify(index, null, 1));
console.log(urls.size, "image urls,", n, "new");
