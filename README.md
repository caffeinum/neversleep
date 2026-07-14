# neversleep

**give your claude anxiety.**

AI is great — but it has no ownership, no skin in the game. It calls the work done and clocks out. `neversleep` makes it sweat: it wraps [Claude Code](https://claude.com/claude-code) so it works 24/7 and keeps second-guessing its own output, even when it's sure it's finished. It never decides it's done. You do.

```sh
bunx neversleep claude
```

Use `claude` however you normally would; flags pass straight through.

Every time it thinks it's finished, it doesn't get to stop — it takes another pass, fretting about a different thing each lap. And it doesn't just write tests and tidy syntax; it actually **runs the software** and watches what it really does:

`run-it → correctness → edge-cases → regression → senior-eng → (repeat)`

**Stop it:** ctrl-c. That's the only off switch — on purpose.
