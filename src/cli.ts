#!/usr/bin/env bun
// neversleep — wraps `claude` so it keeps checking and improving its own work
// until you stop it. Injects an appended system prompt and a Stop hook via a
// throwaway settings file, without touching the user's project settings.
//
//   bunx neversleep claude [claude args...]

import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink, readdir } from "node:fs/promises";
import { SYSTEM_PROMPT } from "./prompt.ts";

const TMP = tmpdir();

// ctrl-c is the only way to stop neversleep, and it kills us before the cleanup
// on line ~exit runs — so every real session would otherwise leave its settings
// file behind. Sweep leftovers from dead runs at startup. This never touches
// SIGINT, so ctrl-c stays untrapped.
async function sweepStaleSettings() {
  for (const f of await readdir(TMP).catch(() => [] as string[])) {
    const m = f.match(/^neversleep-settings-(\d+)\.json$/);
    if (!m) continue;
    try {
      process.kill(Number(m[1]), 0); // alive → leave it
    } catch (e: any) {
      if (e?.code === "ESRCH") await unlink(join(TMP, f)).catch(() => {}); // dead → remove
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

await sweepStaleSettings();

const hookPath = new URL("./hook.ts", import.meta.url).pathname;

// Pin the interpreter to the absolute bun binary running us, not a bare `bun`.
// Claude Code runs this Stop-hook command through its own shell, whose PATH may
// not include bun — a bare `bun` there silently breaks the loop. Both paths are
// JSON-quoted so spaces survive the shell.
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
    env: { ...process.env, NEVERSLEEP: "1" },
  },
);

const code = await proc.exited;
await unlink(settingsPath).catch(() => {});
process.exit(code);
