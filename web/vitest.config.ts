import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node", css: { include: [/style\.css/] } }, // css: theme.test.ts reads style.css?raw
});
