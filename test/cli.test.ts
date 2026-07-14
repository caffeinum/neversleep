import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, writeFile, mkdtemp, chmod, rm, mkdir, cp, utimes } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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

// neversleep is a transparent wrapper — scripts/CI around it rely on its exit code
// being claude's, not the wrapper's. Lock that passthrough.
test("propagates claude's exit code", async () => {
  const stubDir = await mkdtemp(join(tmpdir(), "ns-exit-"));
  const stub = join(stubDir, "claude");
  await writeFile(stub, "#!/usr/bin/env bash\nexit 17\n");
  await chmod(stub, 0o755);

  const proc = Bun.spawn([process.execPath, CLI, "claude", "-p", "x"], {
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  const code = await proc.exited;
  expect(code).toBe(17);

  await rm(stubDir, { recursive: true, force: true });
});

// The Stop-hook command runs in Claude Code's own shell, whose PATH may lack bun.
// So the command must invoke bun by absolute path, not bare `bun`, or the loop
// silently breaks. Capture the generated settings file and assert this.
test("hook command uses an absolute interpreter path, not bare `bun`", async () => {
  const stubDir = await mkdtemp(join(tmpdir(), "ns-set-"));
  const out = join(stubDir, "captured-settings.json");
  const stub = join(stubDir, "claude");
  // copy the --settings file out before neversleep deletes it on exit
  await writeFile(
    stub,
    `#!/usr/bin/env bash\nprev=""\nfor a in "$@"; do\n  [ "$prev" = "--settings" ] && cp "$a" "${out}"\n  prev="$a"\ndone\nexit 0\n`,
  );
  await chmod(stub, 0o755);

  const proc = Bun.spawn([process.execPath, CLI, "claude", "-p", "x"], {
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;

  const settings = await Bun.file(out).json();
  const command: string = settings.hooks.Stop[0].hooks[0].command;
  expect(command.startsWith('"/')).toBe(true); // absolute, quoted
  expect(command).not.toMatch(/^bun\b/); // never bare bun
  expect(command).toContain("hook.ts");

  await rm(stubDir, { recursive: true, force: true });
});

// HIGH-sev regression: an install path with a space must NOT get percent-encoded
// into the hook command (URL.pathname bug). fileURLToPath must decode it. We run a
// copy of the cli from a real "with space" dir and inspect the generated command.
test("resolves the hook path under a spaced install dir (decoded, not %20)", async () => {
  const base = await mkdtemp(join(tmpdir(), "ns-space-"));
  const spaced = join(base, "with space", "src");
  await mkdir(spaced, { recursive: true });
  const srcDir = fileURLToPath(new URL("../src", import.meta.url));
  for (const f of ["cli.ts", "hook.ts", "prompt.ts"]) await cp(join(srcDir, f), join(spaced, f));

  const out = join(base, "captured.json");
  const stubDir = await mkdtemp(join(tmpdir(), "ns-space-stub-"));
  const stub = join(stubDir, "claude");
  await writeFile(
    stub,
    `#!/usr/bin/env bash\nprev=""\nfor a in "$@"; do\n  [ "$prev" = "--settings" ] && cp "$a" "${out}"\n  prev="$a"\ndone\nexit 0\n`,
  );
  await chmod(stub, 0o755);

  const proc = Bun.spawn([process.execPath, join(spaced, "cli.ts"), "claude", "-p", "x"], {
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;

  const command: string = (await Bun.file(out).json()).hooks.Stop[0].hooks[0].command;
  expect(command).toContain("with space"); // literal space, decoded
  expect(command).not.toContain("with%20space"); // never percent-encoded
  expect(command).toContain("hook.ts");

  await rm(base, { recursive: true, force: true });
  await rm(stubDir, { recursive: true, force: true });
});

// state files (neversleep-<sessionId>.json) have no pid handle — the sweep must
// age them out so tmpdir doesn't accumulate litter, without touching fresh ones.
test("sweeps stale state files by age, keeps fresh ones", async () => {
  const oldFile = join(tmpdir(), `neversleep-oldsess-${process.pid}.json`);
  const freshFile = join(tmpdir(), `neversleep-freshsess-${process.pid}.json`);
  await writeFile(oldFile, JSON.stringify({ passes: 3 }));
  await writeFile(freshFile, JSON.stringify({ passes: 1 }));
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  await utimes(oldFile, twoDaysAgo, twoDaysAgo);

  const stubDir = await mkdtemp(join(tmpdir(), "ns-sweep-"));
  const stub = join(stubDir, "claude");
  await writeFile(stub, "#!/usr/bin/env bash\nexit 0\n");
  await chmod(stub, 0o755);
  const proc = Bun.spawn([process.execPath, CLI, "claude", "-p", "x"], {
    env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.exited;

  expect(await Bun.file(oldFile).exists()).toBe(false); // stale → reaped
  expect(await Bun.file(freshFile).exists()).toBe(true); // fresh → kept

  await unlink(freshFile).catch(() => {});
  await rm(stubDir, { recursive: true, force: true });
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
