import { test, expect } from "bun:test";

const CLI = new URL("../src/cli.ts", import.meta.url).pathname;

// Use the absolute bun binary so the child runs regardless of PATH, then hand it a
// PATH with no `claude` on it — the guard should fire before anything spawns.
test("exits 127 with an install hint when claude is missing", async () => {
  const proc = Bun.spawn([process.execPath, CLI, "claude", "-p", "hi"], {
    env: { PATH: "/var/empty-neversleep-test" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  expect(code).toBe(127);
  expect(err).toContain("`claude` not found");
  expect(err).toContain("claude.com/claude-code");
});
