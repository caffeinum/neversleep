import { test, expect, afterEach } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, mkdir, rm } from "node:fs/promises";

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

test("escalates through the interleaved rung ladder, then wraps", async () => {
  const s = freshSession();
  const stages: string[] = [];
  for (let i = 0; i < 11; i++) {
    const out = await runHook({ session_id: s, last_assistant_message: `pass ${i}` });
    stages.push(out.reason.match(/· (\S+) ·/)![1]);
  }
  expect(stages.slice(0, 10)).toEqual([
    "run-it", "user", "edge-cases", "friction", "scope",
    "correctness", "value-prop", "delight", "moonshot", "senior-eng",
  ]);
  expect(stages[10]).toBe("run-it"); // wraps back around — endless
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

test("neutralizes a path-traversal session_id — never writes outside tmpdir", async () => {
  const marker = `pwned-${process.pid}`;
  const escaped = join(tmpdir(), "..", marker); // where a naive impl would land
  await unlink(escaped).catch(() => {});
  sessions.push(`tmp${marker}`); // sanitized form, for cleanup

  const out = await runHook({ session_id: `../../../../tmp/${marker}`, last_assistant_message: "x" });
  expect(out.decision).toBe("block");

  // the traversal target must NOT have been created
  expect(await Bun.file(escaped).exists()).toBe(false);
  // the sanitized state file (dots + slashes stripped) is what actually gets written
  expect(await Bun.file(join(tmpdir(), `neversleep-tmp${marker}.json`)).exists()).toBe(true);
});

test("stays valid under concurrent invocations on one session — no crash, no corruption", async () => {
  const s = freshSession();
  // 12 hooks racing on the same state file. runHook throws if any output is
  // non-JSON/empty, so a crash or half-written read fails the test.
  const outs = await Promise.all(
    Array.from({ length: 12 }, () => runHook({ session_id: s, last_assistant_message: "x" })),
  );
  for (const o of outs) expect(o.decision).toBe("block"); // every one blocked, none crashed
  const state = await Bun.file(join(tmpdir(), `neversleep-${s}.json`)).json();
  expect(typeof state.passes).toBe("number"); // state file survived as valid JSON
});

test("the ladder leads with running and pushes subagents + ultracode", async () => {
  const s = freshSession();
  const reasons: string[] = [];
  for (let i = 0; i < 10; i++) {
    // walk the whole ladder so we cover every rung
    reasons.push((await runHook({ session_id: s, last_assistant_message: "x" })).reason);
  }
  const all = reasons.join(" ").toLowerCase();
  expect(all).toContain("subagent"); // product requirement: encourage subagents
  expect(all).toContain("ultracode"); // product requirement: encourage ultracode
  expect(reasons[0]!.toLowerCase()).toContain("run"); // run-it rung leads
});

test("the ladder is diverse — not just engineering rungs", async () => {
  const s = freshSession();
  const stages = new Set<string>();
  for (let i = 0; i < 10; i++) {
    stages.add((await runHook({ session_id: s, last_assistant_message: "x" })).reason.match(/· (\S+) ·/)![1]);
  }
  // product / ux / scope / brainstorm rungs must survive, not just eng
  for (const s of ["user", "friction", "scope", "value-prop", "delight", "moonshot"]) {
    expect(stages.has(s)).toBe(true);
  }
});

test("still blocks when the state file can't be persisted", async () => {
  const s = freshSession();
  // make the state path a DIRECTORY so Bun.write throws — the block must still emit
  const statePath = join(tmpdir(), `neversleep-${s}.json`);
  await mkdir(statePath);
  const out = await runHook({ session_id: s, last_assistant_message: "x" });
  expect(out.decision).toBe("block"); // loop survives a persistence failure
  await rm(statePath, { recursive: true, force: true });
});

test("survives an empty / non-JSON stdin", async () => {
  const proc = Bun.spawn(["bun", HOOK], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  await proc.stdin.end(); // no input at all
  const out = JSON.parse((await new Response(proc.stdout).text()) || "{}");
  await proc.exited;
  expect(out.decision).toBe("block"); // still blocks under "default" session
});
