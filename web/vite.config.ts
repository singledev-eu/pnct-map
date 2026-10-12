import { defineConfig } from "vite";

// Deployed at the domain root (https://pnct.singledev.eu/). BASE_PATH overrides
// it for a sub-path build, e.g. BASE_PATH=/pnct-map/.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
