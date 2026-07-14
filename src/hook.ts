#!/usr/bin/env bun
// neversleep Stop hook.
// Claude Code runs this when claude tries to end its turn. It reads the hook
// payload on stdin and prints a decision on stdout:
//   {"decision":"block","reason":"..."}  -> claude keeps going, `reason` injected
//   {}                                    -> claude is allowed to rest
//
// We intentionally IGNORE payload.stop_hook_active — looping is the whole point.
// The loop only ends when claude emits the sentinel, NEVERSLEEP_MAX_PASSES is hit,
// or the human presses ctrl-c (which bypasses hooks entirely).

import { tmpdir } from "node:os";
import { join } from "node:path";

// Each pass climbs a different rung, so every nudge asks for a *different* kind of
// improvement instead of re-litigating the same check forever. Wraps around.
const RUNGS = [
  { stage: "correctness", reason: "fresh eyes — trace the happy path. does it actually do the thing you meant?" },
  { stage: "tests", reason: "now prove it. run the tests for real, and add one that exercises the tricky path if it's missing." },
  { stage: "edge-cases", reason: "take a lap through the weird inputs: null, empty, huge, malformed, concurrent. what breaks?" },
  { stage: "simplify", reason: "is there a simpler shape hiding in here? dead code, clearer names, smaller surface, one job per piece." },
  { stage: "senior-eng", reason: "last lap of the loop — a sharp senior eng glances at your diff. what's the first thing they'd flag? security, perf, footguns. if you're genuinely done, say NEVERSLEEP_DONE and why." },
];

const SENTINEL = "NEVERSLEEP_DONE";
const MAX_PASSES = Number(process.env.NEVERSLEEP_MAX_PASSES ?? 0); // 0 = unlimited

function allow(why: string): never {
  process.stderr.write(`neversleep: letting claude rest — ${why}\n`);
  process.stdout.write("{}");
  process.exit(0);
}

async function lastAssistantText(p: any): Promise<string> {
  if (typeof p?.last_assistant_message === "string" && p.last_assistant_message) {
    return p.last_assistant_message;
  }
  if (p?.transcript_path) {
    try {
      const raw = await Bun.file(p.transcript_path).text();
      for (const line of raw.trimEnd().split("\n").reverse()) {
        let obj: any;
        try { obj = JSON.parse(line); } catch { continue; }
        const role = obj?.role ?? obj?.message?.role ?? obj?.type;
        if (role === "assistant") return JSON.stringify(obj);
      }
    } catch {}
  }
  return "";
}

const payload: any = await Bun.stdin.json().catch(() => ({}));

// off-ramp 1: claude honestly signaled it's done
const lastText = await lastAssistantText(payload);
if (lastText.includes(SENTINEL)) allow("claude signaled NEVERSLEEP_DONE");

// per-session pass counter
const sessionId = String(payload?.session_id ?? "default").replace(/[^A-Za-z0-9_-]/g, "");
const stateFile = join(tmpdir(), `neversleep-${sessionId}.json`);
let passes = 0;
try { passes = Number((await Bun.file(stateFile).json())?.passes) || 0; } catch {}

// off-ramp 2: hard ceiling (opt-in via env)
if (MAX_PASSES > 0 && passes >= MAX_PASSES) {
  await Bun.write(stateFile, JSON.stringify({ passes: 0 }));
  allow(`hit NEVERSLEEP_MAX_PASSES=${MAX_PASSES}`);
}

const rung = RUNGS[passes % RUNGS.length]!;
const passNo = passes + 1;
await Bun.write(stateFile, JSON.stringify({ passes: passNo }));

const ceiling = MAX_PASSES > 0 ? `/${MAX_PASSES}` : "";
process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `[neversleep · ${rung.stage} · pass ${passNo}${ceiling}] ${rung.reason}`,
}));
