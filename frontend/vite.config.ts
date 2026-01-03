import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE || "http://127.0.0.1:8000";

  return {
    plugins: [
      react(),
      visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
        open: false, // Set to false to prevent auto-opening, user can manually open dist/stats.html
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Only process node_modules
            if (!id.includes("node_modules")) {
              return undefined;
            }

            // REQUIRED: React core - must be first to catch react and react-dom
            if (id.includes("react") || id.includes("react-dom")) {
              // Exclude react-router-dom and other react-* packages from react chunk
              if (
                id.includes("react-router-dom") ||
                id.includes("react-i18next") ||
                id.includes("react-hook-form")
              ) {
                return undefined;
              }
              return "react";
            }
            
            // REQUIRED: Router
            if (id.includes("react-router-dom")) {
              return "router";
            }
            
            // REQUIRED: i18n - all i18n related packages
            if (
              id.includes("i18next") ||
              id.includes("react-i18next") ||
              id.includes("i18next-browser-languagedetector")
            ) {
              return "i18n";
            }
            
            // REQUIRED: Forms - react-hook-form, zod, and resolvers
            if (
              id.includes("react-hook-form") ||
              id.includes("zod") ||
              id.includes("@hookform/resolvers")
            ) {
              return "forms";
            }
            
            // REQUIRED: Animation - framer-motion
            if (id.includes("framer-motion")) {
              return "motion";
            }
            
            // REQUIRED: Query - TanStack Query
            if (id.includes("@tanstack/react-query")) {
              return "query";
            }
            
            // Additional optimizations (optional but recommended)
            // Floating UI - used by Radix UI and other components
            if (id.includes("@floating-ui")) {
              return "floating-ui";
            }
            
            // Radix UI components - chunk separately from floating-ui
            if (id.includes("@radix-ui")) {
              return "radix-ui";
            }
            
            // Icons
            if (id.includes("lucide-react")) {
              return "icons";
            }
            
            // UI utilities
            if (
              id.includes("class-variance-authority") ||
              id.includes("clsx") ||
              id.includes("tailwind-merge")
            ) {
              return "ui-utils";
            }
            
            // Theme
            if (id.includes("next-themes")) {
              return "theme";
            }
            
            // Toast notifications (small but used globally)
            if (id.includes("sonner")) {
              return "toast";
            }
            
            // Return undefined for other packages to let Vite handle them
            return undefined;
          },
        },
      },
    },
    server: {
      proxy: {
        "/api": {
          target: apiBase,
          changeOrigin: true,
          secure: false,
          ws: true, // Enable WebSocket proxying for SSE
          configure: (proxy, _options) => {
            proxy.on("error", (err, _req, res) => {
              console.error("Proxy error:", err.message);
              // Don't log every retry attempt to reduce noise
            });
            proxy.on("proxyReq", (proxyReq, req, _res) => {
              // Only log non-category requests to reduce noise
              // Don't use import.meta.env here as it's not available in Node context
              if (req.url && !req.url.includes('/categories')) {
                // Only log in verbose mode (can be controlled via env var if needed)
                // For now, just log errors
              }
            });
            proxy.on("proxyRes", (proxyRes, req, _res) => {
              // Log errors but not successful requests
              if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
                console.error(`Proxy response error: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
              }
            });
          },
        },
      },
    },
  };
});


