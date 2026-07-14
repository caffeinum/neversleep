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
// just generating tests or polishing syntax.
const RUNGS = [
  { stage: "run-it", reason: "don't take your word for it — actually run the thing. launch it, drive the real flow end-to-end like a user would, and watch what it really does. no 'should work'." },
  { stage: "correctness", reason: "now trace the paths you didn't exercise. does every branch truly do what you meant, or just the happy one you clicked through?" },
  { stage: "edge-cases", reason: "feed it the ugly inputs for real — null, empty, huge, malformed, concurrent — and run them. what actually falls over?" },
  { stage: "regression", reason: "lock in what you just proved by hand: add a test that drives the tricky path so it can't silently break later." },
  { stage: "senior-eng", reason: "a sharp senior eng puts the running system through its paces. what breaks in the real world — security, perf, footguns? then back to the top." },
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
