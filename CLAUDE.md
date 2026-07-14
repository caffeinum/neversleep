
# neversleep

CLI that wraps `claude` so it keeps re-checking/improving its work until stopped. Published to npm as `neversleep` (domain: anxiety.dev).

- `src/cli.ts` — bin. Spawns `claude` with `--append-system-prompt` (the intern-mode prompt) + `--settings` (a temp file wiring the Stop hook), passing user argv through. `neversleep claude ...` or `neversleep ...` both work.
- `src/hook.ts` — the Stop hook. Reads payload on stdin, prints `{"decision":"block","reason":...}` to keep claude going, or `{}` to let it stop. **Intentionally ignores `stop_hook_active`** — looping is the whole point.
- `src/prompt.ts` — the appended system prompt (craftsman framing, not anxious grind).

Loop escalates through rungs (run-it → correctness → edge-cases → regression → senior-eng), cycling endlessly. The ladder **leads with actually running the built software** end-to-end (not just generating tests / polishing syntax) — that's a deliberate product stance. The hook **always** blocks — claude never voluntarily stops. The only off-ramp is ctrl-c (never trapped; bypasses hooks). No sentinel, no max-passes ceiling. Per-session pass counter (just for rung cycling/display) lives in `$TMPDIR/neversleep-<session_id>.json`.

Public framing (README) = an anxious intern that can't stop working. Internal framing (prompt.ts + hook rung voice) = a craftsman who enjoys the refining. Keep those separate: craftsmanship never surfaces in the README.

Stop hook contract (Claude Code): exit 0 + `{"decision":"block","reason":"..."}` blocks the stop and injects `reason`; exit 0 + `{}` (or no output) allows it.

---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

Server:

```ts#index.ts
import index from "./index.html"

Bun.serve({
  routes: {
    "/": index,
    "/api/users/:id": {
      GET: (req) => {
        return new Response(JSON.stringify({ id: req.params.id }));
      },
    },
  },
  // optional websocket support
  websocket: {
    open: (ws) => {
      ws.send("Hello, world!");
    },
    message: (ws, message) => {
      ws.send(message);
    },
    close: (ws) => {
      // handle close
    }
  },
  development: {
    hmr: true,
    console: true,
  }
})
```

HTML files can import .tsx, .jsx or .js files directly and Bun's bundler will transpile & bundle automatically. `<link>` tags can point to stylesheets and Bun's CSS bundler will bundle.

```html#index.html
<html>
  <body>
    <h1>Hello, world!</h1>
    <script type="module" src="./frontend.tsx"></script>
  </body>
</html>
```

With the following `frontend.tsx`:

```tsx#frontend.tsx
import React from "react";
import { createRoot } from "react-dom/client";

// import .css files directly and it works
import './index.css';

const root = createRoot(document.body);

export default function Frontend() {
  return <h1>Hello, world!</h1>;
}

root.render(<Frontend />);
```

Then, run index.ts

```sh
bun --hot ./index.ts
```

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.
