import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    server: { deps: { inline: [/epi-ui/, /epi-login/, /@mui/, /@emotion/] } },
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
    dedupe: ["react", "react-dom", "@emotion/react", "@emotion/styled", "@mui/material", "@mui/icons-material"],
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
