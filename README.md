# neversleep

an intern that never clocks out.

Wraps [Claude Code](https://claude.com/claude-code) with a productive case of anxiety: every time it thinks it's done, it second-guesses itself and takes another pass. It never decides it's finished — you do.

```sh
bunx neversleep claude
```

Use `claude` however you normally would; flags pass straight through.

Each pass frets about a different thing, so it's not just re-reading the same file:

`correctness → tests → edge-cases → simplify → senior-eng → (repeat)`

**Stop it:** ctrl-c. That's the only off switch — on purpose.
