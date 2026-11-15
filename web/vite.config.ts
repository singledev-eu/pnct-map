import { defineConfig, loadEnv } from "vite";
import { cfWebAnalytics } from "./analytics";

// Deployed at the domain root (https://pnct.singledev.eu/). BASE_PATH overrides
// it for a sub-path build, e.g. BASE_PATH=/pnct-map/.
// CF_WEB_ANALYTICS_TOKEN (environment or a gitignored web/.env*.local) turns on Cloudflare Web
// Analytics in the build; unset, there is none (analytics.ts, README "Analytics").
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "CF_"), ...process.env };
  return {
    base: process.env.BASE_PATH ?? "/",
    worker: { format: "es" },
    build: { target: "es2022", chunkSizeWarningLimit: 1500 },
    plugins: [cfWebAnalytics(env.CF_WEB_ANALYTICS_TOKEN)],
  };
});
