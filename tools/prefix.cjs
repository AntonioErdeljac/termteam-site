// Serve the built site under a sub-path (GitHub Pages project URL, e.g. /termteam-site).
// node tools/prefix.cjs <dir> <prefix>   — rewrites root-relative links in every .html file in place.
const fs = require("fs"), path = require("path");
const [dir, prefix] = process.argv.slice(2);
if (!prefix || prefix === "/") process.exit(0);
const P = prefix.replace(/\/$/, "");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(dir).filter((f) => f.endsWith(".html"))) {
  let h = fs.readFileSync(f, "utf8");
  // href/src/srcset/url() and the same inside the JSON motion spec (escaped quotes)
  h = h.replace(/((?:href|src|action)=\\?["'])\/(?!\/)/g, `$1${P}/`)
    .replace(/((?:srcset)=\\?["'][^"']*)/g, (m) => m.replace(/(^|[\s,"'])\/(images|assets)\//g, `$1${P}/$2/`))
    .replace(/url\((["']?|\\")\/(images|assets)\//g, `url($1${P}/$2/`)
    .replace(/(content=")\/(images)\//g, `$1${P}/$2/`);
  fs.writeFileSync(f, h);
}
