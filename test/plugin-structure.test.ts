import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// Guards the plugin's on-disk layout — the exact thing that silently broke when
// marketplace.json was nested in plugin/ instead of the repo root, so
// `/plugin marketplace add caffeinum/neversleep` couldn't find it.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const marketplace = () => readJson(join(ROOT, ".claude-plugin", "marketplace.json"));
const pluginDir = () => join(ROOT, marketplace().plugins[0].source);

test("marketplace.json sits at the repo root where /plugin marketplace add looks", () => {
  const mp = join(ROOT, ".claude-plugin", "marketplace.json");
  expect(existsSync(mp)).toBe(true);
  const m = readJson(mp);
  expect(typeof m.name).toBe("string");
  expect(Array.isArray(m.plugins)).toBe(true);
  expect(m.plugins.length).toBeGreaterThan(0);
});

test("each plugin source resolves to a valid plugin.json with a matching name", () => {
  const m = marketplace();
  for (const p of m.plugins) {
    const manifest = join(ROOT, p.source, ".claude-plugin", "plugin.json");
    expect(existsSync(manifest)).toBe(true);
    expect(readJson(manifest).name).toBe(p.name);
  }
});

test("hooks.json is valid and its command points at a hook script that exists", () => {
  const hooks = readJson(join(pluginDir(), "hooks", "hooks.json"));
  const cmd: string = hooks.hooks.Stop[0].hooks[0].command;
  const rel = cmd.replace(/.*\$\{CLAUDE_PLUGIN_ROOT\}\//, ""); // -> hooks/stop.ts
  expect(existsSync(join(pluginDir(), rel))).toBe(true);
});

test("the /anxiety command and its toggle script are present", () => {
  expect(existsSync(join(pluginDir(), "commands", "anxiety.md"))).toBe(true);
  expect(existsSync(join(pluginDir(), "commands", "toggle.sh"))).toBe(true);
});

test("the command passes $ARGUMENTS to the toggle, not $1", () => {
  // Claude Code populates $ARGUMENTS for slash commands, NOT $1 — passing $1 made
  // `/anxiety off` silently default back to on. Guard against reintroducing it.
  const md = readFileSync(join(pluginDir(), "commands", "anxiety.md"), "utf8");
  expect(md).toContain('"$ARGUMENTS"');
  expect(md).not.toMatch(/toggle\.sh"\s+"\$1"/);
});
