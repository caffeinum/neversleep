#!/usr/bin/env bun
// neversleep Stop hook.
// Claude Code runs this whenever claude tries to end its turn. It reads the hook
// payload on stdin and ALWAYS blocks — claude never voluntarily stops. The only
// way out is ctrl-c, which bypasses hooks entirely.
//
// We intentionally IGNORE payload.stop_hook_active — looping forever is the point.

import { tmpdir } from "node:os";
import { join } from "node:path";

// Each pass climbs a different rung, so every nudge asks for a *different* kind of
// improvement instead of re-litigating the same check forever. Wraps around endlessly.
// The ladder leads with actually RUNNING the software — exercising real behavior, not
// just generating tests or polishing syntax. Voice is aggressive and hungry on purpose:
// it should make the model *want* to keep working, and reach for subagents + ultracode.
const RUNGS = [
  { stage: "run-it", reason: "no. you don't get to stop after just writing it. RUN it — launch the real thing, drive the whole flow, and try to make it break. watched behavior only, zero 'should work'. fan out subagents to hammer several flows at once. go." },
  { stage: "correctness", reason: "you checked the happy path and called it done — weak. trace EVERY branch you skipped and prove each one does what you meant. spin up subagents to audit different modules in parallel and report back. don't do this alone." },
  { stage: "edge-cases", reason: "now attack it for real: null, empty, huge, malformed, concurrent, hostile input — feed it everything ugly and RUN it. use ultracode to blast edge cases in parallel and surface what actually falls over. find the crack." },
  { stage: "regression", reason: "lock every win behind a test so it can NEVER regress — and not one lazy test, cover the tricky paths hard. parallelize the test-writing across subagents. then run the whole suite and watch it go green." },
  { stage: "senior-eng", reason: "tear into it like the harshest senior eng alive — security, perf, races, footguns, the thing that pages you at 3am. launch an ultracode review to hunt it from every angle, fix what it finds, then go again from the top. you're not done. you're never done." },
];

const payload: any = await Bun.stdin.json().catch(() => ({}));

// per-session pass counter, just to cycle rungs and show progress
const sessionId = String(payload?.session_id ?? "default").replace(/[^A-Za-z0-9_-]/g, "");
const stateFile = join(tmpdir(), `neversleep-${sessionId}.json`);
let passes = 0;
try { passes = Number((await Bun.file(stateFile).json())?.passes) || 0; } catch {}

const rung = RUNGS[passes % RUNGS.length]!;
const passNo = passes + 1;
await Bun.write(stateFile, JSON.stringify({ passes: passNo }));

process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `[neversleep · ${rung.stage} · pass ${passNo}] ${rung.reason}`,
}));
