// One-time migration: download every image still served from Framer's CDN into
// src/images/ and point the content files at the local copies.
// Run with: npm run fetch-images
import { readFile, writeFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

const MAX_WIDTH = 2000;
const IMAGES_DIR = "src/images";
const files = [
  ...(await readdir("src/_data")).filter((f) => f.endsWith(".json")).map((f) => join("src/_data", f)),
  ...(await readdir("src/services")).filter((f) => f.endsWith(".md")).map((f) => join("src/services", f)),
];
const urlPattern = /https:\/\/framerusercontent\.com\/images\/([A-Za-z0-9]+)\.(jpe?g|png|svg|webp|gif)(\?[^"'\s)]*)?/g;

const exists = (p) => access(p).then(() => true, () => false);
let downloaded = 0;

for (const file of files) {
  let text = await readFile(file, "utf8");
  const matches = [...text.matchAll(urlPattern)];
  if (!matches.length) continue;
  for (const [full, id, ext] of matches) {
    const local = `/images/${id}.${ext === "jpeg" ? "jpg" : ext}`;
    const target = join(IMAGES_DIR, local.replace("/images/", ""));
    if (!(await exists(target))) {
      const src = `https://framerusercontent.com/images/${id}.${ext}` + (ext === "svg" ? "" : `?scale-down-to=${MAX_WIDTH}`);
      const res = await fetch(src);
      if (!res.ok) throw new Error(`${res.status} for ${src}`);
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      downloaded++;
      console.log("saved", target);
    }
    text = text.replaceAll(full, local);
  }
  await writeFile(file, text);
  console.log("updated", file);
}
console.log(`Done. ${downloaded} new image(s) downloaded.`);
