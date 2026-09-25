import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
      include: [
        "src/lib/api-client.ts",
        "src/store/auth.store.ts",
        "src/router/default-route.ts",
        "src/features/reports/api.ts",
        "src/features/surveys/api.ts",
        "src/features/reports/lib/format.ts",
        "src/features/reports/lib/section-rows.ts",
        "src/features/reports/templates/**/*.ts",
      ],
      exclude: ["src/**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
