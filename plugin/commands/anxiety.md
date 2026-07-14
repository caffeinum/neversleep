---
description: give your claude anxiety — it won't stop working until you turn it off
argument-hint: "[on|off]"
allowed-tools: Bash
---

!`bash "${CLAUDE_PLUGIN_ROOT}/commands/toggle.sh" "$1" "${CLAUDE_SESSION_ID}"`

Relay the anxiety state from the command output above to the user in one short line, in your own voice.
