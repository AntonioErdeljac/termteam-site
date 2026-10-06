import markdownIt from "markdown-it";
import { HtmlBasePlugin } from "@11ty/eleventy";

const md = markdownIt({ html: false, linkify: true });

export default function (eleventyConfig) {
  // Rewrites root-relative links when the site is served from a sub-path (GitHub Pages project URL).
  eleventyConfig.addPlugin(HtmlBasePlugin);

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  eleventyConfig.addPassthroughCopy({ "src/images": "images" });
  eleventyConfig.addPassthroughCopy({ "src/admin": "admin" });
  eleventyConfig.addPassthroughCopy({
    "node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2": "assets/fonts/figtree-latin.woff2",
    "node_modules/@fontsource-variable/figtree/files/figtree-latin-ext-wght-normal.woff2": "assets/fonts/figtree-latin-ext.woff2",
  });

  // Images that still live on Framer's CDN get resized there; local images pass through.
  eleventyConfig.addFilter("img", (src, width = 1600) => {
    if (!src) return "";
    return src.includes("framerusercontent.com") ? `${src.split("?")[0]}?scale-down-to=${width}` : src;
  });
  eleventyConfig.addFilter("md", (s) => md.render(s || ""));
  eleventyConfig.addFilter("mdInline", (s) => md.renderInline(s || ""));
  eleventyConfig.addFilter("tel", (s) => "tel:" + String(s).replace(/[^\d+]/g, ""));
  eleventyConfig.addFilter("byOrder", (arr) => [...arr].sort((a, b) => (a.data.order ?? 99) - (b.data.order ?? 99)));
  eleventyConfig.addShortcode("year", () => String(new Date().getFullYear()));

  return {
    dir: { input: "src", includes: "_includes", data: "_data", output: "_site" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    pathPrefix: process.env.PATH_PREFIX || "/",
  };
}
