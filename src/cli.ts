#!/usr/bin/env bun
// neversleep — wraps `claude` so it keeps checking and improving its own work
// until you stop it. Injects an appended system prompt and a Stop hook via a
// throwaway settings file, without touching the user's project settings.
//
//   bunx neversleep claude [claude args...]

import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SYSTEM_PROMPT } from "./prompt.ts";

const TMP = tmpdir();
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // reap state files idle > 1 day

// Sweep tmpdir litter from dead runs at startup. ctrl-c (the only way to stop
// neversleep) kills the wrapper before its own cleanup runs, and every session
// also leaves a small state file behind. Never touches SIGINT, so ctrl-c stays
// untrapped.
async function sweepStale() {
  const now = Date.now();
  for (const f of await readdir(TMP).catch(() => [] as string[])) {
    const settings = f.match(/^neversleep-settings-(\d+)\.json$/);
    if (settings) {
      try {
        process.kill(Number(settings[1]), 0); // alive → leave it
      } catch (e: any) {
        if (e?.code === "ESRCH") await unlink(join(TMP, f)).catch(() => {}); // dead → remove
      }
      continue;
    }
    // per-session state files (neversleep-<sessionId>.json) have no pid handle —
    // an active session keeps its mtime fresh, so age-out the stale ones.
    if (/^neversleep-[^/]+\.json$/.test(f)) {
      const st = await stat(join(TMP, f)).catch(() => null);
      if (st && now - st.mtimeMs > STATE_MAX_AGE_MS) await unlink(join(TMP, f)).catch(() => {});
    }
  }
}

const args = process.argv.slice(2);
if (args[0] === "claude") args.shift(); // allow `neversleep claude ...` or `neversleep ...`

if (!Bun.which("claude")) {
  process.stderr.write(
    "neversleep: `claude` not found on your PATH.\n" +
      "install Claude Code first: https://claude.com/claude-code\n",
  );
  process.exit(127);
}

await sweepStale();

// fileURLToPath, NOT .pathname — .pathname keeps percent-encoding (%20 for a
// space, etc.), so an install path with a space or non-ASCII char would bake a
// broken path into the hook command and silently kill the loop. fileURLToPath
// decodes it and fixes the Windows leading-slash too.
const hookPath = fileURLToPath(new URL("./hook.ts", import.meta.url));

// Pin the interpreter to the absolute bun binary running us, not a bare `bun`.
// Claude Code runs this Stop-hook command through its own shell, whose PATH may
// not include bun — a bare `bun` there silently breaks the loop. Both paths are
// JSON-quoted so spaces in the (now-decoded) path survive the shell.
const settings = {
  hooks: {
    Stop: [
      {
        hooks: [
          { type: "command", command: `${JSON.stringify(process.execPath)} ${JSON.stringify(hookPath)}` },
        ],
      },
    ],
  },
};

const settingsPath = join(TMP, `neversleep-settings-${process.pid}.json`);
await Bun.write(settingsPath, JSON.stringify(settings, null, 2));

const proc = Bun.spawn(
  ["claude", "--append-system-prompt", SYSTEM_PROMPT, "--settings", settingsPath, ...args],
  {
    stdio: ["inherit", "inherit", "inherit"],
    env: {
      ...process.env,
      NEVERSLEEP: "1",
      // Claude Code force-ends the turn after ~9 consecutive Stop-hook blocks with no
      // progress. neversleep is meant to never stop, so raise the cap to effectively
      // unlimited — ctrl-c stays the real off switch. (Don't clobber a user's value.)
      CLAUDE_CODE_STOP_HOOK_BLOCK_CAP: process.env.CLAUDE_CODE_STOP_HOOK_BLOCK_CAP ?? "1000000",
    },
  },
);

const code = await proc.exited;
await unlink(settingsPath).catch(() => {});
process.exit(code);
