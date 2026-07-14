# neversleep

**give your claude anxiety.**

AI is great — but it has no ownership, no skin in the game. It calls the work done and clocks out. `neversleep` makes it sweat: it wraps [Claude Code](https://claude.com/claude-code) so it works 24/7 and keeps second-guessing its own output, even when it's sure it's finished. It never decides it's done. You do.

```sh
bunx neversleep claude
```

Use `claude` however you normally would; flags pass straight through.

Every time it thinks it's finished, it doesn't get to stop — it takes another pass, fretting about a *different* thing each lap. Not just the code: whether it actually runs, who the user is, how it feels in the first thirty seconds, what could be deleted, and the occasional what-if-we-went-10x. And it actually **runs the software** instead of assuming:

`run-it → user → edge-cases → friction → scope → correctness → value → delight → moonshot → senior-eng → (repeat)`

**Stop it:** ctrl-c. That's the only off switch — on purpose.
