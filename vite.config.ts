import { defineConfig } from "vitest/config";

// No fixed dev port. When a harness assigns one (PORT env), bind exactly
// that so the preview can find the server; otherwise let vite use its own
// default and auto-increment past anything busy. Parallel checkouts and
// spawned-session worktrees never contend for the same port.
const envPort = Number(process.env.PORT);
const port = Number.isFinite(envPort) && envPort > 0 ? envPort : undefined;

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port,
    strictPort: port !== undefined,
  },
  preview: {
    host: "0.0.0.0",
    port,
    strictPort: port !== undefined,
  },
  test: {
    environment: "node",
  },
});
