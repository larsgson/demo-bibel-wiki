import { defineConfig } from "astro/config"
import svelte from "@astrojs/svelte"
import react from "@astrojs/react"
import tailwind from "@astrojs/tailwind"
import prerenderIsos from "./config/prerender-isos.json" with { type: "json" }

const prerendered = new Set(prerenderIsos)

export default defineConfig({
  output: "static",
  integrations: [svelte(), react(), tailwind()],
  vite: {
    optimizeDeps: {
      include: ["svelte-gestures", "proskomma-core", "fflate", "hls.js"],
    },
    server: {
      proxy: {
        "/.netlify/functions": {
          target: "http://localhost:9999",
          changeOrigin: true,
        },
      },
    },
    plugins: [
      {
        name: "iso-fallback",
        configureServer(server) {
          // Paths that should never be rewritten
          const skipPrefixes = [
            "/src/", "/node_modules/", "/@", "/_astro/",
            "/pkf/", "/bsb/", "/templates/", "/ALL-langs",
            "/public/", "/favicon", "/manifest", "/.netlify", "/.well-known",
          ]

          server.middlewares.use((req, res, next) => {
            const url = req.url || ""
            if (skipPrefixes.some((p) => url.startsWith(p))) return next()
            // Skip Vite internal requests (HMR, etc.)
            if (url.includes("?")) {
              const path = url.split("?")[0]
              if (path.includes(".")) return next()
            }

            const match = url.match(/^\/([a-z]{3})(\/.*)?$/)
            if (match) {
              const iso = match[1]
              const rest = match[2] || ""
              // Only rewrite if it looks like an ISO (not a known route prefix)
              const knownPrefixes = ["src", "api", "app", "img"]
              if (!prerendered.has(iso) && !knownPrefixes.includes(iso)) {
                const sep = rest.includes("?") ? "&" : "?"
                req.url = `/l${rest}${sep}lang=${iso}`
              }
            }
            next()
          })
        },
      },
    ],
  },
})
