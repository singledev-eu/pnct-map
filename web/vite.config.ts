import { defineConfig } from "vite";

// BASE_PATH lets the build live under a sub-path (e.g. "/pnct-map/" on GitHub
// Pages). The default "./" makes the build relocatable to any path.
export default defineConfig({
  base: process.env.BASE_PATH ?? "./",
  worker: { format: "es" },
  build: { target: "es2022", chunkSizeWarningLimit: 1500 },
});
