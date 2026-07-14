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
  expect(stages.slice(0, 5)).toEqual(["correctness", "tests", "edge-cases", "simplify", "senior-eng"]);
  expect(stages[5]).toBe("correctness"); // wraps back around — endless
});

test("survives an empty / non-JSON stdin", async () => {
  const proc = Bun.spawn(["bun", HOOK], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  await proc.stdin.end(); // no input at all
  const out = JSON.parse((await new Response(proc.stdout).text()) || "{}");
  await proc.exited;
  expect(out.decision).toBe("block"); // still blocks under "default" session
});
