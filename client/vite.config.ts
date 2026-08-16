import { defineConfig } from "vite";
import dns from "dns";

// Node.js 17+ での localhost / IP 解決の遅延（IPv6優先問題）を解消
dns.setDefaultResultOrder("ipv4first");

export default defineConfig({
  esbuild: {
    target: "es2019",
  },
  server: {
    port: 5173,
    host: "0.0.0.0", // すべてのインターフェースで待ち受け
    allowedHosts: true,
    strictPort: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:8080",
        ws: true,
        changeOrigin: true, // プロキシ先とオリジンが異なる場合の遅延を防止
      },
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    target: "es2019",
    outDir: "dist",
    emptyOutDir: true,
  },
});
