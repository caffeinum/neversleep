import { test, expect, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";

const HOOK = new URL("../plugin/hooks/stop.ts", import.meta.url).pathname;
const TOGGLE = new URL("../plugin/commands/toggle.sh", import.meta.url).pathname;

const SID = `plugintest-${process.pid}`;
const toggleFile = join(tmpdir(), `anxiety-on-${SID}`);
const stateFile = join(tmpdir(), `anxiety-${SID}.json`);

// runs the bash toggle script the /anxiety command would run (arg, session id)
async function toggle(arg: string) {
  const p = Bun.spawn(["bash", TOGGLE, arg, SID], { stdout: "ignore", stderr: "ignore" });
  await p.exited;
}

// runs the Stop hook with a payload carrying the same session id
async function runHook() {
  const p = Bun.spawn(["bun", HOOK], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  p.stdin.write(JSON.stringify({ session_id: SID }));
  await p.stdin.end();
  const out = await new Response(p.stdout).text();
  await p.exited;
  return JSON.parse(out || "{}");
}

afterEach(async () => {
  await unlink(toggleFile).catch(() => {});
  await unlink(stateFile).catch(() => {});
});

test("hook allows the stop when the toggle is off", async () => {
  await toggle("off");
  expect((await runHook()).decision).toBeUndefined(); // {} => allow
});

test("/anxiety on makes the hook block — bash toggle + node hook agree on the session key", async () => {
  await toggle("on");
  const out = await runHook();
  // if the two sides derived different keys, the hook wouldn't find the toggle
  expect(out.decision).toBe("block");
  expect(out.reason).toContain("anxiety");
});

test("bare /anxiety (no arg) turns the loop on", async () => {
  await toggle(""); // empty arg defaults to on
  expect((await runHook()).decision).toBe("block");
});

test("/anxiety off disengages the loop again", async () => {
  await toggle("on");
  expect((await runHook()).decision).toBe("block");
  await toggle("off");
  expect((await runHook()).decision).toBeUndefined();
});

test("/anxiety OFF (any case) means off, not on", async () => {
  await toggle("on");
  expect((await runHook()).decision).toBe("block");
  await toggle("OFF"); // must not fall through to the default 'on' branch
  expect((await runHook()).decision).toBeUndefined();
});

test("plugin hook escalates through the full 10-rung ladder and wraps", async () => {
  await toggle("on");
  const stages: string[] = [];
  for (let i = 0; i < 11; i++) {
    stages.push((await runHook()).reason.match(/· (\S+) ·/)![1]);
  }
  // the plugin's RUNGS is its own copy of the CLI ladder — guard against drift
  expect(stages.slice(0, 10)).toEqual([
    "run-it", "user", "edge-cases", "friction", "scope",
    "correctness", "value-prop", "delight", "moonshot", "senior-eng",
  ]);
  expect(stages[10]).toBe("run-it"); // wraps back around
});

test("a hostile session id can't escape tmpdir and still keys consistently", async () => {
  const hostile = `../../../../tmp/pwned-${process.pid}; \`whoami\``;
  const sanitized = hostile.replace(/[^A-Za-z0-9_-]/g, ""); // node side
  const escaped = join(tmpdir(), "..", `pwned-${process.pid}`);
  await unlink(escaped).catch(() => {});

  // bash toggle sanitizes independently; if it disagrees with node, the hook won't block
  const t = Bun.spawn(["bash", TOGGLE, "on", hostile], { stdout: "ignore", stderr: "ignore" });
  await t.exited;
  const p = Bun.spawn(["bun", HOOK], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  p.stdin.write(JSON.stringify({ session_id: hostile }));
  await p.stdin.end();
  const out = JSON.parse((await new Response(p.stdout).text()) || "{}");
  await p.exited;

  expect(out.decision).toBe("block"); // both sides derived the same SAFE key
  expect(existsSync(escaped)).toBe(false); // nothing escaped tmpdir

  await unlink(join(tmpdir(), `anxiety-on-${sanitized}`)).catch(() => {});
  await unlink(join(tmpdir(), `anxiety-${sanitized}.json`)).catch(() => {});
});
