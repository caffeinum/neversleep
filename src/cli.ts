#!/usr/bin/env bun
// neversleep — wraps `claude` so it keeps checking and improving its own work
// until you stop it. Injects an appended system prompt and a Stop hook via a
// throwaway settings file, without touching the user's project settings.
//
//   bunx neversleep claude [claude args...]

import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { SYSTEM_PROMPT } from "./prompt.ts";

const args = process.argv.slice(2);
if (args[0] === "claude") args.shift(); // allow `neversleep claude ...` or `neversleep ...`

if (!Bun.which("claude")) {
  process.stderr.write(
    "neversleep: `claude` not found on your PATH.\n" +
      "install Claude Code first: https://claude.com/claude-code\n",
  );
  process.exit(127);
}

const hookPath = new URL("./hook.ts", import.meta.url).pathname;

const settings = {
  hooks: {
    Stop: [{ hooks: [{ type: "command", command: `bun ${JSON.stringify(hookPath)}` }] }],
  },
};

const settingsPath = join(tmpdir(), `neversleep-settings-${process.pid}.json`);
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
