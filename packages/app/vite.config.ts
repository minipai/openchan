import { sentryVitePlugin } from "@sentry/vite-plugin"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv } from "vite"
import desktopPlugin, { channel } from "./vite.js"
import { icons } from "./vite.icons"
import { serviceWorker } from "./vite.pwa"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_OPENCODE_")
  const chatLayout = env.VITE_OPENCODE_CHAT_LAYOUT ?? "stage"

  if (chatLayout !== "stage" && chatLayout !== "flow") {
    throw new Error(`Invalid VITE_OPENCODE_CHAT_LAYOUT="${chatLayout}". Expected "stage" or "flow".`)
  }

  const outDir = chatLayout === "flow" ? "dist-flow" : "dist"

  const sentry =
    process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? sentryVitePlugin({
          authToken: process.env.SENTRY_AUTH_TOKEN,
          org: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          telemetry: false,
          release: {
            name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
          },
          sourcemaps: {
            assets: `./${outDir}/**`,
            filesToDeleteAfterUpload: `./${outDir}/**/*.map`,
          },
        })
      : false

  return {
    plugins: [
      desktopPlugin,
      icons(channel),
      serviceWorker(fileURLToPath(new URL(`./${outDir}`, import.meta.url))),
      sentry,
    ],
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
      port: 3000,
    },
    build: {
      rolldownOptions: process.env.VITE_OPENCODE_TEST_FIXTURES === "1"
        ? {
            input: [
              "index.html",
              "e2e/utils/settings-wsl.html",
              "e2e/utils/app-direction.html",
              "e2e/utils/windows-menu.html",
            ],
          }
        : undefined,
      outDir,
      assetsDir: "_assets",
      target: "esnext",
      sourcemap: true,
    },
  }
})
