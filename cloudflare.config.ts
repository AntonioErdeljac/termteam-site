import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "termteam-site",
    compatibilityDate: "2026-10-01",
    observability: { enabled: true },
    assets: { notFoundHandling: "404-page", htmlHandling: "drop-trailing-slash" },
  },
});
