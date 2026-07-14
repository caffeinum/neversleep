# neversleep

an intern that never clocks out.

`neversleep` wraps [Claude Code](https://claude.com/claude-code) and gives it a mild, productive case of anxiety: it can't leave the work alone. Every time it thinks it's done, it second-guesses itself and takes another pass — re-reading the diff, re-running the tests, poking at the edge cases — and it never, ever decides it's finished. It just keeps going until *you* pull the plug.

```sh
bunx neversleep claude
```

That's it. Use `claude` exactly as you normally would — all flags pass straight through:

```sh
bunx neversleep claude -p "refactor the auth module"
bunx neversleep claude --model opus
```

## the anxious intern

It's the intern who stays late because they're *sure* there's one more bug in there somewhere. Instead of stopping when it runs out of obvious things to do, neversleep keeps circling back — and it circles through a different worry each pass, so it's not just re-reading the same file forever:

`correctness → tests → edge-cases → simplify → senior-eng review → (round and round)`

Each lap asks a different question. Does it actually work? Do the tests prove it? What about weird inputs? Can this be simpler? What would a senior eng flag? Then it starts over from the top, because in an anxious mind the work is never truly done.

## stopping it

There's exactly one off switch, and it's yours: **ctrl-c**. neversleep will never stop on its own — that's the whole point. When you've seen enough, interrupt it.

## requirements

- [Bun](https://bun.sh)
- [Claude Code](https://claude.com/claude-code) on your PATH (`claude`)

## license

MIT
