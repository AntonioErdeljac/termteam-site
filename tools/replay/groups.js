// Group click recordings that touch the same elements (shared with tools/interact-spec.cjs).
const SKIP = new Set(["data-hn", "data-ruid", "data-uid", "decoding", "loading", "sizes", "srcset", "src"]);
function groupsOf(records) {
  const touched = records.map((r) => { const s = new Set(); for (const l of r.log) { if (!l[1]) continue; if (l[2] === "add" || l[2] === "remove") s.add("node:" + l[1]); else if (!SKIP.has(l[2])) s.add(l[1] + "|" + l[2]); } return s; });
  const parent = records.map((_, i) => i); const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = {}; touched.forEach((s, i) => s.forEach((k) => { if (k.endsWith("|style")) return; /* style writes are animation residue; they do not tie components together */ if (k in owner) parent[find(i)] = find(owner[k]); else owner[k] = i; }));
  const gs = {}; records.forEach((r, i) => (gs[find(i)] ||= []).push(i));
  return Object.values(gs).map((idxs) => { const slots = [...new Set(idxs.flatMap((i) => [...touched[i]]))]; return { triggers: [...new Set(idxs.map((i) => records[i].id))], attrSlots: slots.filter((k) => !k.startsWith("node:")).map((k) => k.split("|")) }; });
}
module.exports = { groupsOf, SKIP };
