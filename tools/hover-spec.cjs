// Turn hover recordings (mutation logs) into a compact spec: which elements change, rest/hover values, and the timing curve.
const CANDS = [
  { type: "spring", stiffness: 500, damping: 60, mass: 1 }, { type: "spring", stiffness: 220, damping: 40, mass: 1 },
  { type: "spring", stiffness: 400, damping: 40, mass: 1 }, { type: "spring", stiffness: 400, damping: 30, mass: 1 },
  { type: "spring", stiffness: 650, damping: 60, mass: 1 }, { type: "spring", stiffness: 550, damping: 30, mass: 1 }, { type: "spring", stiffness: 500, damping: 25, mass: 1 },
  { type: "tween", duration: 0.2, ease: [0.27, 0, 0.51, 1] }, { type: "tween", duration: 0.25, ease: [0.44, 0, 0.56, 1] }, { type: "tween", duration: 0.2, ease: [0.44, 0, 0.56, 1] },
  { type: "tween", duration: 0.3, ease: [0.25, 0.1, 0.35, 1] }, { type: "tween", duration: 0.45, ease: [0.4, 0, 0.1, 1] }, { type: "tween", duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
];
function parseStyle(s) { const o = {}; if (!s) return o; for (const part of s.split(/;(?![^(]*\))/)) { const i = part.indexOf(":"); if (i < 0) continue; const k = part.slice(0, i).trim(); if (k) o[k] = part.slice(i + 1).trim(); } return o; }
function springCurve(o) { // normalised 0->1 progress, framer-motion spring
  const k = o.stiffness, c = o.damping, m = o.mass || 1, z = c / (2 * Math.sqrt(k * m)), w = Math.sqrt(k / m) / 1000, d = 1;
  if (z < 1) { const wd = w * Math.sqrt(1 - z * z); return (t) => 1 - Math.exp(-z * w * t) * ((z * w * d) / wd * Math.sin(wd * t) + d * Math.cos(wd * t)); }
  if (z === 1) return (t) => 1 - Math.exp(-w * t) * (d + w * d * t);
  const wo = w * Math.sqrt(z * z - 1); return (t) => { const e = Math.exp(-z * w * t), r = Math.min(wo * t, 300); return 1 - (e * (z * w * d * Math.sinh(r) + wo * d * Math.cosh(r))) / wo; };
}
function bez(x1, y1, x2, y2) { const a = (t, p1, p2) => ((1 - 3 * p2 + 3 * p1) * t + (3 * p2 - 6 * p1)) * t * t + 3 * p1 * t; return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 30; i++) { t = (lo + hi) / 2; if (a(t, x1, x2) < x) lo = t; else hi = t; } return a(t, y1, y2); }; }
function curve(c) { if (c.type === "spring") return springCurve(c); const e = bez(...c.ease), D = c.duration * 1000; return (t) => e(t / D); }
const firstNum = (v) => { const m = /-?\d*\.?\d+(?:e-?\d+)?/.exec(v || ""); return m ? +m[0] : null; };
// fit: samples [[t, value]] where value moves from v0 to v1
function fit(samples, v0, v1, tStart) {
  if (samples.length < 3 || v0 === v1) return null;
  let best = null;
  for (const c of CANDS) for (let lag = 0; lag <= 34; lag += 2) {
    const f = curve(c); let err = 0;
    for (const [t, v] of samples) { const p = (v - v0) / (v1 - v0); err += (p - f(Math.max(0, t - tStart - lag))) ** 2; }
    err /= samples.length; if (!best || err < best.err) best = { c, lag, err };
  }
  return best;
}
// one direction of a hover: log entries in [ta, tb)
function phase(log, ta, tb, restOf) {
  const per = {};
  for (const [t, id, attr, val] of log) { if (t < ta || t >= tb) continue; (per[id] ||= { attrs: {}, styles: [] }); if (attr === "style") per[id].styles.push([t, val]); else per[id].attrs[attr] = val; }
  return per;
}
function build(rec, restDom) {
  // restDom: id -> attrs at rest (from the settled dump)
  const into = phase(rec.log, rec.t0, rec.t1), out = phase(rec.log, rec.t1, Infinity);
  const targets = [];
  for (const id of new Set([...Object.keys(into), ...Object.keys(out)])) {
    const rest = restDom[id] || {}; const a = into[id] || { attrs: {}, styles: [] }, b = out[id] || { attrs: {}, styles: [] };
    const restStyle = parseStyle(rest.style); const hovStr = a.styles.length ? a.styles[a.styles.length - 1][1] : rest.style; const hovStyle = parseStyle(hovStr);
    const attrs = {}; for (const [k, v] of Object.entries(a.attrs)) if (v !== (rest[k] ?? null)) attrs[k] = [rest[k] ?? null, v];
    const props = {}; for (const k of new Set([...Object.keys(restStyle), ...Object.keys(hovStyle)])) if (restStyle[k] !== hovStyle[k]) props[k] = [restStyle[k] ?? "", hovStyle[k] ?? ""];
    // transform samples that start and end the same = layout animation
    const tfs = a.styles.map(([t, v]) => [t, parseStyle(v).transform]).filter((x) => x[1] !== undefined);
    const layout = tfs.length > 2 && restStyle.transform === hovStyle.transform && tfs.some((x) => x[1] !== restStyle.transform);
    const pick = (styles, from, to, t0) => { for (const k of Object.keys(props)) { const v0 = firstNum(from[k]), v1 = firstNum(to[k]); if (v0 === null || v1 === null || v0 === v1) continue; const s = styles.map(([t, v]) => [t, firstNum(parseStyle(v)[k])]).filter((x) => x[1] !== null); const f = fit(s, v0, v1, t0); if (f) return f; } return null; };
    const fin = pick(a.styles, restStyle, hovStyle, rec.t0), fout = pick(b.styles, hovStyle, restStyle, rec.t1);
    if (!Object.keys(attrs).length && !Object.keys(props).length && !layout) continue;
    targets.push({ id, attrs, props, rest: rest.style ?? null, hover: hovStr ?? null, trIn: fin && { ...fin.c, lag: fin.lag, err: +fin.err.toFixed(5) }, trOut: fout && { ...fout.c, lag: fout.lag, err: +fout.err.toFixed(5) }, layout });
  }
  return { id: rec.id, targets };
}
module.exports = { build, parseStyle, fit, CANDS };
