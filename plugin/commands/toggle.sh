#!/usr/bin/env bash
# anxiety plugin — toggle the per-session loop on/off.
# Args: $1 = on|off|status (default on), $2 = session id (falls back to
# $CLAUDE_SESSION_ID). The key MUST match hooks/stop.ts: session_id sanitized
# to [A-Za-z0-9_-].
set -euo pipefail

arg="${1:-on}"
sid="${2:-${CLAUDE_SESSION_ID:-default}}"
sid="$(printf '%s' "$sid" | tr -cd 'A-Za-z0-9_-')"
[ -n "$sid" ] || sid="default"

toggle="${TMPDIR:-/tmp}/anxiety-on-${sid}"

case "$arg" in
  off | stop | 0 | false)
    rm -f "$toggle"
    echo "anxiety OFF — claude can rest now."
    ;;
  status)
    if [ -f "$toggle" ]; then echo "anxiety is ON for this session."; else echo "anxiety is OFF."; fi
    ;;
  *)
    : >"$toggle"
    echo "anxiety ON — claude won't stop until you run /anxiety off (or press ctrl-c)."
    ;;
esac
