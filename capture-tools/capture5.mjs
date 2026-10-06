// Fetch individual assets the earlier captures missed (listed in capture-tools/urls5.txt) into capture/net.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const index = JSON.parse(await readFile("capture/net/index.json", "utf8"));
const urls = (await readFile("capture-tools/urls5.txt", "utf8")).split("\n").map((s) => s.trim()).filter(Boolean);
for (const u of urls) {
  const r = await fetch(u); const body = Buffer.from(await r.arrayBuffer()); const h = createHash("md5").update(u).digest("hex");
  index[u] = { file: h, status: r.status, type: r.headers.get("content-type") || "" }; await writeFile(`capture/net/${h}`, body);
  console.log(r.status, body.length, u);
}
await writeFile("capture/net/index.json", JSON.stringify(index, null, 1));
