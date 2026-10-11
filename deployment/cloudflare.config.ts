import { defineConfig } from "cf/config"

export default defineConfig({
  worker: {
    name: "openchan",
    domains: ["openchan.starcoder.dev"],
    assets: { notFoundHandling: "single-page-application" },
    compatibilityDate: "2026-09-25",
    observability: { enabled: true },
  },
})
