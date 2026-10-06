// Turn recorded hover/click mutation logs into replayable operations for motion.js.
// Each phase (in / out) becomes a list of ops with times relative to the trigger:
//   ["attr", t, id, name, value]        set an attribute (class, style, data-*)
//   ["add", t, parentId, nextId, html]  insert a node Framer mounted
//   ["remove", t, id]                   remove a node Framer unmounted
//   ["anim", t, id, keyframes, timing]  WAAPI animation (Framer's own, or rebuilt from per-frame style writes)
const { parseStyle } = require("./hover-spec.cjs");

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
function phase(log, ta, tb, baseAnims, anims) {
  const ops = []; const styles = {}; const lastAttr = {};
  const entries = log.filter((l) => l[0] >= ta && l[0] < tb);
  for (const [t, id, kind, val, a4, a5] of entries) {
    if (!id) continue;
    const rt = Math.round(t - ta);
    if (kind === "add") ops.push(["add", rt, a4, a5, val]);
    else if (kind === "remove") ops.push(["remove", rt, id]);
    else if (kind === "style") (styles[id] ||= { old: a4, writes: [] }).writes.push([rt, val]);
    else { if (kind === "data-hn" || kind === "data-ruid" || kind === "data-uid") continue; if (lastAttr[id + kind] === val) continue; lastAttr[id + kind] = val; ops.push(["attr", rt, id, kind, val]); }
  }
  for (const [id, s] of Object.entries(styles)) {
    const w = s.writes; const fin = w[w.length - 1][1];
    // properties that change across writes are animated frame by frame
    const seq = [[w[0][0], parseStyle(s.old)], ...w.map(([t, v]) => [t, parseStyle(v)])];
    const keys = new Set(); for (const [, o] of seq) for (const k in o) keys.add(k);
    const animated = [...keys].filter((k) => new Set(seq.map(([, o]) => o[k] ?? "")).size > 2);
    ops.push(["attr", w[0][0], id, "style", fin]);
    if (animated.length) {
      const t0 = w[0][0], t1 = w[w.length - 1][0], dur = Math.max(t1 - t0, 1);
      const frames = w.map(([t, v]) => { const o = parseStyle(v), k = { offset: +((t - t0) / dur).toFixed(4) }; for (const p of animated) if (o[p] !== undefined) k[cssProp(p)] = o[p]; return k; });
      // start frame: value before the first write
      const o0 = parseStyle(s.old); const k0 = { offset: 0 }; for (const p of animated) if (o0[p] !== undefined) k0[cssProp(p)] = o0[p];
      if (Object.keys(k0).length > 1 && frames[0].offset === 0) frames[0] = { ...k0, ...frames[0], offset: 0 };
      dedupeOffsets(frames);
      ops.push(["anim", t0, id, frames, { duration: dur, easing: "linear", fill: "backwards" }]);
    }
  }
  for (const a of anims || []) {
    if (a.css || baseAnims.some((b) => b.id === a.id && b.timing.duration === a.timing.duration)) continue;
    const kf = a.kf.map((k) => { const o = {}; for (const x in k) if (x !== "offset" || k.offset !== null) o[x === "offset" ? "offset" : x] = k[x]; return o; });
    ops.push(["anim", Math.max(0, Math.round(-(a.t || 0))), a.id, kf, { duration: a.timing.duration, easing: a.timing.easing, delay: a.timing.delay, iterations: a.timing.iterations === "Infinity" ? Infinity : a.timing.iterations, fill: "backwards" }]);
  }
  // normalise times so the first op happens at 0
  const tmin = Math.min(...ops.map((o) => o[1]), Infinity);
  if (isFinite(tmin)) for (const o of ops) o[1] -= tmin;
  ops.sort((a, b) => a[1] - b[1]);
  return ops;
}
function cssProp(p) { return p.startsWith("--") ? p : p.replace(/-([a-z])/g, (m, c) => c.toUpperCase()); }
function dedupeOffsets(frames) { for (let i = frames.length - 1; i > 0; i--) if (frames[i].offset === frames[i - 1].offset) frames.splice(i - 1, 1); if (frames.length) frames[frames.length - 1].offset = 1; }

function fromHover(r, baseAnims) {
  return { on: r.id, kind: "hover", in: phase(r.log, r.t0, r.t1, baseAnims, r.aIn), out: phase(r.log, r.t1, Infinity, baseAnims, r.aOut) };
}
function fromClick(r, baseAnims) {
  const a = phase(r.log, r.t0, r.t1, baseAnims, r.a1), b = phase(r.log, r.t1, Infinity, baseAnims, r.a2);
  // toggle when the second click undoes the first (attributes return to their old values)
  const first = {}, last = {};
  for (const [t, id, kind, val, old] of r.log) { if (kind === "add" || kind === "remove" || kind === "style" || kind.startsWith("data-hn")) continue; const k = id + "|" + kind; if (!(k in first)) first[k] = old; last[k] = val; }
  const toggle = Object.keys(first).every((k) => norm(first[k]) === norm(last[k]));
  return { on: r.id, kind: "click", toggle, in: a, out: toggle ? b : [] };
}
function norm(v) { return v == null ? "" : String(v).replace(/\s+/g, "").replace(/;$/, ""); }
module.exports = { fromHover, fromClick, phase };

// Clicks as a state machine. Recordings were made one after another on the same page, so replaying
// their logs in order gives the full DOM state after every click. Clicks whose logs touch the same
// elements form one group (an accordion, a gallery); each trigger knows the state it leads to.
function clickGroups(records, baseAttr, baseAnims) {
  const SKIP = new Set(["data-hn", "data-ruid", "data-uid", "decoding", "loading", "sizes", "srcset", "src"]);
  const touched = records.map((r) => { const s = new Set(); for (const l of r.log) { if (!l[1]) continue; if (l[2] === "add" || l[2] === "remove") s.add("node:" + l[1]); else if (!SKIP.has(l[2])) s.add(l[1] + "|" + l[2]); } return s; });
  // union-find over records sharing a slot
  const parent = records.map((_, i) => i); const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = {};
  touched.forEach((s, i) => s.forEach((k) => { if (k.endsWith("|style")) return; /* style writes are animation residue; they do not tie components together */ if (k in owner) parent[find(i)] = find(owner[k]); else owner[k] = i; }));
  const groups = {};
  records.forEach((r, i) => (groups[find(i)] ||= []).push(i));
  const out = [];
  for (const idxs of Object.values(groups)) {
    const slots = [...new Set(idxs.flatMap((i) => [...touched[i]]))];
    const attrSlots = slots.filter((k) => !k.startsWith("node:")).map((k) => k.split("|"));
    const nodeIds = slots.filter((k) => k.startsWith("node:")).map((k) => k.slice(5));
    const nodes = {};
    const cur = {}; for (const [id, a] of attrSlots) cur[id + "|" + a] = baseAttr(id, a);
    const present = new Set(nodeIds.filter((id) => !id.startsWith("h")));
    const states = []; const snap = () => { const v = attrSlots.map(([id, a]) => cur[id + "|" + a] ?? null); const n = nodeIds.filter((id) => present.has(id)); const key = JSON.stringify([v.filter((_, i) => attrSlots[i][1] !== "style"), n]); /* style is animation residue, not state */ let i = states.findIndex((s) => s.key === key); if (i < 0) { states.push({ key, v, n }); i = states.length - 1; } return i; };
    snap();
    const triggers = {};
    for (const i of idxs) {
      const r = records[i];
      const apply = (ta, tb) => { for (const l of r.log) { if (l[0] < ta || l[0] >= tb || !l[1]) continue; if (l[2] === "add") { present.add(l[1]); nodes[l[1]] ||= { html: l[3], parent: l[4], next: l[5] }; } else if (l[2] === "remove") { present.delete(l[1]); nodes[l[1]] ||= { parent: l[4] }; } else if (!SKIP.has(l[2])) cur[l[1] + "|" + l[2]] = l[3]; } };
      // anims, plus how long Framer kept unmounting nodes around (exit animations)
      const ph = (ta, tb, an) => { const ops = phase(r.log, ta, tb, baseAnims, an); const rm = {}; for (const o of ops) if (o[0] === "remove" && o[1] > 0) rm[o[2]] = o[1]; return [ops.filter((o) => o[0] === "anim"), rm]; };
      const tr = (triggers[r.id] ||= []); const addT = (from, to, x) => { if (!tr.some((t) => t[0] === from)) tr.push([from, to, x[0], x[1]]); };
      const s0 = snap(); apply(r.t0, r.t1); const s1 = snap(); addT(s0, s1, ph(r.t0, r.t1, r.a1));
      if (!r.explore) { apply(r.t1, Infinity); const s2 = snap(); addT(s1, s2, ph(r.t1, Infinity, r.a2)); }
    }
    // a style that ends the same in every state is animation residue (or another group's): leave it alone
    const keep = attrSlots.map(([, a], i) => a !== "style" || new Set(states.map((s) => s.v[i])).size > 1);
    out.push({ attrs: attrSlots.filter((_, i) => keep[i]), nodeIds, nodes, states: states.map((s) => [s.v.filter((_, i) => keep[i]), s.n]), triggers });
  }
  return out;
}
module.exports.clickGroups = clickGroups;
