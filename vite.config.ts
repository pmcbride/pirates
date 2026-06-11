import { defineConfig } from "vitest/config";

// Default dev port; PORT env overrides so parallel checkouts/worktrees
// (and preview harnesses with autoPort) don't collide on the same port.
const port = Number(process.env.PORT ?? 5180);

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port,
  },
  preview: {
    host: "0.0.0.0",
    port,
  },
  test: {
    environment: "node",
  },
});
