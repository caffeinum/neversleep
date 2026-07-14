import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile, mkdtemp, chmod, rm } from "node:fs/promises";

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

// ctrl-c leaks the settings file (kills the wrapper before cleanup); the next run
// must sweep dead-pid leftovers while never touching a still-running session's file.
test("sweeps stale settings files from dead runs, keeps live ones", async () => {
  const dead = join(tmpdir(), "neversleep-settings-999999.json"); // pid that doesn't exist
  const live = join(tmpdir(), `neversleep-settings-${process.pid}.json`); // this test proc is alive
  await writeFile(dead, "{}");
  await writeFile(live, "{}");

  const stubDir = await mkdtemp(join(tmpdir(), "ns-stub-"));
  const stub = join(stubDir, "claude");
  await writeFile(stub, "#!/usr/bin/env bash\nexit 0\n");
  await chmod(stub, 0o755);

  const proc = Bun.spawn([process.execPath, CLI, "claude", "-p", "x"], {
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;

  expect(await Bun.file(dead).exists()).toBe(false); // dead-pid leftover swept
  expect(await Bun.file(live).exists()).toBe(true); // live-pid file preserved

  await unlink(live).catch(() => {});
  await rm(stubDir, { recursive: true, force: true });
});
