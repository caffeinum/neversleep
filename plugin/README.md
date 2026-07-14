# anxiety (Claude Code plugin)

Give your Claude anxiety, right inside Claude Code — no wrapper CLI. Type `/anxiety`
and it won't stop working: every time it thinks it's done, it takes another pass
(run-it → user → edge-cases → friction → scope → correctness → value → delight →
moonshot → senior-eng → repeat) until you turn it off.

This is the [neversleep](https://www.npmjs.com/package/neversleep) loop as a plugin.
Unlike the CLI (which always loops), the plugin is **opt-in per session** via a toggle.

## install

```
/plugin marketplace add caffeinum/neversleep
/plugin install anxiety@anxiety
```

Or for local testing from a clone:

```
/plugin marketplace add /path/to/neversleep/plugin
/plugin install anxiety@anxiety
```

Requires [Bun](https://bun.sh) on your PATH (the Stop hook runs `bun`).

## use

```
/anxiety        turn the loop ON for this session (stays on)
/anxiety off    turn it off
/anxiety status is it on?
```

Once on, Claude keeps re-checking and improving its work every time it tries to
stop. **The off switches:** `/anxiety off`, or ctrl-c (always).

## how it works

- `/anxiety` runs a tiny toggle script that touches `$TMPDIR/anxiety-on-<session>`.
- A `Stop` hook fires whenever Claude tries to end its turn. If the toggle exists,
  it returns `{"decision":"block","reason":"…"}` with the next rung's nudge, so
  Claude keeps going. If not, it returns `{}` and Claude stops normally.
- Keyed by session id, so only the session you toggled loops.
