import { configDefaults, defineConfig } from "vitest/config";

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
    // Spawned-session worktrees live under .claude/worktrees/ INSIDE the repo,
    // and each carries its own src/**/*.test.ts. Vitest's default glob would
    // sweep those sibling-branch tests into every run — inflating the count
    // and letting another branch's mid-edit (or a legitimately different
    // assertion) turn THIS checkout's suite red. Exclude them so `npm test`
    // only ever runs the tests committed on the current branch. (Spread the
    // defaults — node_modules/dist/etc. — rather than replacing them.)
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
