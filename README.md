# neversleep

an intern that never clocks out.

`neversleep` wraps [Claude Code](https://claude.com/claude-code) so it keeps checking and improving its own work — instead of stopping the moment it thinks it's done, it takes another pass, and another, until *you* stop it (or it honestly decides the work is finished).

```sh
bunx neversleep claude
```

That's it. Use `claude` exactly as you normally would — all flags pass straight through:

```sh
bunx neversleep claude -p "refactor the auth module"
bunx neversleep claude --model opus
```

## how it works

Two small injections, nothing touched in your project config:

1. **A Stop hook.** Every time claude tries to end its turn, neversleep nudges it to keep going — but it *escalates* through a checklist so each pass adds a different kind of value instead of spinning on the same check:

   `correctness → tests → edge-cases → simplify → senior-eng review → (repeat)`

2. **A system prompt.** claude is framed as a craftsman who genuinely enjoys the work — the quiet satisfaction of catching the subtle bug on the third pass, of polishing something until it's clean. Not an anxious grind. The point isn't to be done; it's to do it well.

## stopping it

Three off-ramps, weakest to strongest:

- **`NEVERSLEEP_DONE`** — claude can emit this phrase when the work is genuinely, verifiably finished and another pass would just be motion. An honest exit, not a forced one.
- **`NEVERSLEEP_MAX_PASSES=N`** — hard ceiling on total passes (default: `0`, unlimited). Set it if you want a bounded run.
- **ctrl-c** — always works, always immediate. Never trapped.

```sh
NEVERSLEEP_MAX_PASSES=5 bunx neversleep claude -p "tidy up the parser"
```

## requirements

- [Bun](https://bun.sh)
- [Claude Code](https://claude.com/claude-code) on your PATH (`claude`)

## license

MIT
