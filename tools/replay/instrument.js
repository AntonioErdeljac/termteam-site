// Tag every Framer appear/scroll/text effect so the replay reveals which DOM node it drives.
const acorn = require("acorn"), walk = require("acorn-walk");
const FX = {}; let C = 1;
function instrument(src, mod) {
  let ast; try { ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" }); } catch { return src; }
  const defs = {};
  walk.full(ast, (n) => {
    if (n.type === "AssignmentExpression" && n.left.type === "Identifier") defs[n.left.name] = n.right;
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init) defs[n.id.name] = n.init;
  });
  const val = (n, d = 0) => {
    if (!n || d > 10) return undefined;
    switch (n.type) {
      case "Literal": return n.value;
      case "TemplateLiteral": return n.quasis.map((q) => q.value.cooked).join("${}");
      case "UnaryExpression": { const v = val(n.argument, d + 1); return n.operator === "!" ? !v : n.operator === "-" ? -v : v; }
      case "Identifier": return n.name in defs ? val(defs[n.name], d + 1) : `$${n.name}`;
      case "ObjectExpression": { const o = {}; for (const p of n.properties) { if (p.type === "SpreadElement") Object.assign(o, val(p.argument, d + 1) || {}); else { const k = p.key.name ?? p.key.value; if (k === "children" || k === "background") continue; o[k] = val(p.value, d + 1); } } return o; }
      case "ArrayExpression": return n.elements.map((e) => val(e, d + 1));
      case "MemberExpression": return `<member>`;
      default: return `<${n.type}>`;
    }
  };
  const edits = [];
  walk.full(ast, (n) => {
    if (n.type !== "ObjectExpression") return;
    const props = Object.fromEntries(n.properties.filter((p) => p.type === "Property" && !p.computed).map((p) => [p.key.name ?? p.key.value, p]));
    if (props.__framer__enter) {
      const id = C++; FX[id] = { mod, kind: "scroll", cfg: val(n) };
      const v = props.__framer__enter.value; const s = src.slice(v.start, v.end);
      edits.push([v.start, v.end, `(function(o){return Object.assign({},o,{y:(o.y||0)+${id}/10000})})(${s})`]);
    } else if (props.effect && props.className && props.effect.value.type === "Identifier") {
      const id = C++; FX[id] = { mod, kind: "text", cfg: val(n) };
      const v = props.effect.value; const s = src.slice(v.start, v.end);
      edits.push([v.start, v.end, `(function(o){return Object.assign({},o,{effect:Object.assign({},o.effect,{y:(o.effect.y||0)+${id}/10000})})})(${s})`]);
    } else if (props.whileHover || props.__framer__loop || props.__framer__presenceAnimate || props.__framer__parallaxTransformEnabled || props.__framer__styleTransformEffectEnabled) {
      const id = C++; FX[id] = { mod, kind: props.whileHover ? "hover" : props.__framer__loop ? "loop" : "other", cfg: val(n) };
    }
  });
  edits.sort((a, b) => b[0] - a[0]);
  for (const [a, b, t] of edits) src = src.slice(0, a) + t + src.slice(b);
  return src;
}
module.exports = { instrument, FX };
