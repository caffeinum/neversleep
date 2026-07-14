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
// The ladder deliberately interleaves modes — engineering, product/PM, UI/UX, TRIZ
// scope-cutting, LSD-brainstorm — so consecutive passes feel different and the model is
// yanked between building it, questioning it, shrinking it, and dreaming it bigger. It
// leads with actually RUNNING the software (watched behavior, not "should work"). Voice
// is aggressive and hungry on purpose, and pushes subagents + ultracode over solo grind.
const RUNGS = [
  { stage: "run-it", reason: "writing it isn't shipping it. RUN the real thing right now — boot it, walk the whole flow end to end, and shove it till something cracks. i want watched behavior, not one syllable of 'should work.' fan out subagents to drive every flow at once and report what actually happened. move." },
  { stage: "user", reason: "name the actual human who touches this and go be them — what do they want in the first ten seconds, where do they rage-quit? drive the real flow with no mercy and fix what makes them bounce. fan out subagents to walk different user types through it at once and log where each one chokes." },
  { stage: "edge-cases", reason: "now go hostile. null, empty, zero, negative, giant, malformed, unicode, concurrent — feed it the ugliest input you can invent and RUN it, don't theorize. blast the edge cases across parallel subagents and drag whatever falls over into the light. break your own thing before someone else does." },
  { stage: "friction", reason: "cold start, empty state, defaults only, zero docs — become the stranger who's never seen this. time the first thirty seconds and rip out every step that makes them stop and think. spin subagents across fresh setups in parallel, log every single stumble, then smooth it." },
  { stage: "scope", reason: "stop adding — the surface area is bloated and you know it. fewer public functions, fewer knobs, one obvious way in; merge the near-duplicates, inline the single-use helper, cut the API to what's actually called. orchestrate subagents to hunt the redundancy in parallel, then delete it and watch it still pass." },
  { stage: "correctness", reason: "you rode the happy path and quit — that's half the job. walk EVERY branch you dodged and prove with your own eyes each one does exactly what you meant. throw ultracode at separate modules in parallel and make them trace the logic back to you. no guessing, no gaps." },
  { stage: "value-prop", reason: "nobody adopts 'fine.' find the sharp reason someone switches to this and drops what they use today, then make the product scream it in the first interaction. stress the value against the real alternatives, kill every feature that's just noise, and go again." },
  { stage: "delight", reason: "adequate isn't the bar. hunt the dead moment, the clunky beat, the thing that works but feels cheap, and sand it smooth — walk the golden path yourself and FEEL it, don't assume it. surface every rough edge, polish it, then chase the last five percent nobody else bothers with." },
  { stage: "moonshot", reason: "rip the ceiling off — the safe version is beneath you. what's the absurd 10x take, the one that sounds insane until it's obvious? fan out a swarm of subagents, each chasing a different unhinged direction, and drag the wildest one back alive. no timid ideas survive this pass." },
  { stage: "senior-eng", reason: "become the meanest senior eng in the building — security holes, perf cliffs, races, the footgun that pages you at 3am. launch an ultracode review to hunt from every angle at once, fix everything it drags up, then start the climb over from the top. you are not done. you are never done." },
];

const payload: any = await Bun.stdin.json().catch(() => ({}));

// per-session pass counter, just to cycle rungs and show progress
const sessionId = String(payload?.session_id ?? "default").replace(/[^A-Za-z0-9_-]/g, "");
const stateFile = join(tmpdir(), `neversleep-${sessionId}.json`);
let passes = 0;
try { passes = Number((await Bun.file(stateFile).json())?.passes) || 0; } catch {}

const rung = RUNGS[passes % RUNGS.length]!;
const passNo = passes + 1;

// Emit the block FIRST — the loop must never depend on persistence succeeding.
process.stdout.write(JSON.stringify({
  decision: "block",
  reason: `[neversleep · ${rung.stage} · pass ${passNo}] ${rung.reason}`,
}));

// Best-effort counter bump for rung cycling. A write failure (read-only / full
// tmpdir, transient FS error) must not break the loop — the block is already out.
await Bun.write(stateFile, JSON.stringify({ passes: passNo })).catch(() => {});
