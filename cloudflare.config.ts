import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./index.js" with { type: "cf-worker" };

export default defineConfig({
  worker: {
    name: "termteam-site",
    entrypoint,
    compatibilityDate: "2026-10-01",
    observability: { enabled: true },
    // every request goes through index.js first, so www.termteam.hr can redirect
    assets: { notFoundHandling: "404-page", htmlHandling: "drop-trailing-slash", runWorkerFirst: true },
    env: { ASSETS: bindings.assets() },
    domains: ["termteam.hr", "www.termteam.hr"],
  },
});
