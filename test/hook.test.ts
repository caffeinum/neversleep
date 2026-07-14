import { test, expect, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";

const HOOK = new URL("../src/hook.ts", import.meta.url).pathname;

// Run the hook with a given stdin payload, return its parsed stdout JSON.
async function runHook(payload: Record<string, unknown>) {
  const proc = Bun.spawn(["bun", HOOK], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  proc.stdin.write(JSON.stringify(payload));
  await proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return JSON.parse(out || "{}");
}

const sessions: string[] = [];
function freshSession() {
  const id = `test-${sessions.length}-${process.pid}`;
  sessions.push(id);
  return id;
}

afterEach(async () => {
  const ids = sessions.splice(0);
  ids.push("default"); // the empty-stdin case falls back to this session
  await Promise.all(ids.map((id) => unlink(join(tmpdir(), `neversleep-${id}.json`)).catch(() => {})));
});

test("always blocks — never lets claude stop", async () => {
  const out = await runHook({ session_id: freshSession(), last_assistant_message: "all done" });
  expect(out.decision).toBe("block");
  expect(typeof out.reason).toBe("string");
});

test("blocks even when the message contains the old NEVERSLEEP_DONE sentinel", async () => {
  const out = await runHook({
    session_id: freshSession(),
    last_assistant_message: "truly finished NEVERSLEEP_DONE",
  });
  expect(out.decision).toBe("block");
});

test("escalates through rungs across passes, then wraps", async () => {
  const s = freshSession();
  const stages: string[] = [];
  for (let i = 0; i < 6; i++) {
    const out = await runHook({ session_id: s, last_assistant_message: `pass ${i}` });
    stages.push(out.reason.match(/· (\S+) ·/)![1]);
  }
  expect(stages.slice(0, 5)).toEqual(["run-it", "correctness", "edge-cases", "regression", "senior-eng"]);
  expect(stages[5]).toBe("run-it"); // wraps back around — endless
});

test("keeps a separate pass counter per session", async () => {
  const a = freshSession();
  const b = freshSession();
  await runHook({ session_id: a, last_assistant_message: "x" }); // a -> pass 1
  await runHook({ session_id: a, last_assistant_message: "x" }); // a -> pass 2
  const bOut = await runHook({ session_id: b, last_assistant_message: "x" }); // b -> pass 1
  expect(bOut.reason).toContain("pass 1");
  expect(bOut.reason).toContain("run-it"); // b starts fresh at the first rung
});

test("recovers from a corrupted state file — restarts the ladder, still blocks", async () => {
  const s = freshSession();
  await Bun.write(join(tmpdir(), `neversleep-${s}.json`), "{ this is not json ]["); // garbage
  const out = await runHook({ session_id: s, last_assistant_message: "x" });
  expect(out.decision).toBe("block");
  expect(out.reason).toContain("pass 1"); // fell back to 0, never crashed
});

test("survives an empty / non-JSON stdin", async () => {
  const proc = Bun.spawn(["bun", HOOK], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  await proc.stdin.end(); // no input at all
  const out = JSON.parse((await new Response(proc.stdout).text()) || "{}");
  await proc.exited;
  expect(out.decision).toBe("block"); // still blocks under "default" session
});
