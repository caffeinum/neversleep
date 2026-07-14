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
const RUNGS = [
  { stage: "correctness", reason: "fresh eyes — trace the happy path. does it actually do the thing you meant?" },
  { stage: "tests", reason: "now prove it. run the tests for real, and add one that exercises the tricky path if it's missing." },
  { stage: "edge-cases", reason: "take a lap through the weird inputs: null, empty, huge, malformed, concurrent. what breaks?" },
  { stage: "simplify", reason: "is there a simpler shape hiding in here? dead code, clearer names, smaller surface, one job per piece." },
  { stage: "senior-eng", reason: "a sharp senior eng glances at your diff. what's the first thing they'd flag? security, perf, footguns. then we go again from the top." },
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
