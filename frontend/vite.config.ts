import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      port: 8080,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
        "/components": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
        "/design": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
        "/live": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
        "/ready": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
        "/health": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
        "/metrics": {
          target: "http://127.0.0.1:5000",
          changeOrigin: true,
          secure: false,
        },
      },
    },
  },
});

