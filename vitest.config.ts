import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    env: {
      // 로컬 Supabase DATABASE_URL (supabase start 필요)
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/backtest/**/*.ts"],
      exclude: ["src/backtest/**/*.test.ts", "src/backtest/index.ts"],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@/auth": path.resolve(__dirname, "./auth"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
