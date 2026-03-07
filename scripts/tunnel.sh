#!/usr/bin/env bash
# =============================================================================
# tunnel.sh — Start docs server + localtunnel and print the public URL/password
#
# USAGE:
#   ./scripts/tunnel.sh          # start everything, print URL + password
#   ./scripts/tunnel.sh stop     # stop background processes from last session
#   ./scripts/tunnel.sh logs     # tail live logs of both services
#
# HOW IT WORKS:
#   1. Starts `npx mdts` in background, tails its stdout to detect the port.
#   2. Wraps `npx localtunnel` in a restart loop (it's known to drop connections).
#   3. GETs https://loca.lt/mytunnelpassword to obtain the bypass password.
#   4. Writes PIDs + session info to /tmp/tunnel-session.env, then exits.
#   If called with "stop" it reads that file and kills the saved PIDs.
# =============================================================================

set -euo pipefail

SESSION_FILE="/tmp/tunnel-session.env"
DEV_LOG="/tmp/tunnel-dev.log"
LT_LOG="/tmp/tunnel-lt.log"
TIMEOUT=60   # seconds to wait for each process to become ready

# ─── helpers ─────────────────────────────────────────────────────────────────

die() { echo "❌  $*" >&2; exit 1; }
log() { echo "▸  $*"; }

wait_for_line() {
  # wait_for_line <file> <grep-E-pattern> <sed-expr> <timeout>
  local file="$1" pattern="$2" sedexpr="$3" timeout="$4"
  local elapsed=0
  while (( elapsed < timeout )); do
    if [[ -f "$file" ]]; then
      # Strip ANSI escape codes first, then grep
      local match
      match=$(sed 's/\x1B\[[0-9;]*[mK]//g' "$file" 2>/dev/null \
               | grep -oE "$pattern" \
               | sed "$sedexpr" \
               | head -1 || true)
      if [[ -n "$match" ]]; then echo "$match"; return 0; fi
    fi
    sleep 0.5
    (( elapsed++ )) || true
  done
  return 1
}

# ─── logs ────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "logs" ]]; then
  if [[ ! -f "$DEV_LOG" && ! -f "$LT_LOG" ]]; then
    die "No active session log files found. Run 'npm run tunnel' first."
  fi
  echo "▸  Tailing dev server and localtunnel logs (Ctrl-C to stop)..."
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  # tail both files; -n 20 shows the last 20 lines of each first
  tail -n 20 -f "$DEV_LOG" "$LT_LOG" 2>/dev/null
  exit 0
fi

# ─── stop ────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "stop" ]]; then
  if [[ ! -f "$SESSION_FILE" ]]; then
    die "No active session found (missing $SESSION_FILE)."
  fi
  # shellcheck source=/dev/null
  source "$SESSION_FILE"
  log "Stopping docs server (PID $DEV_PID)..."
  kill "$DEV_PID" 2>/dev/null && log "  ✓ docs server stopped" || log "  (already gone)"
  log "Stopping localtunnel wrapper (PID $LT_PID)..."
  # Kill the wrapper process group so child localtunnel processes die too
  kill -- -"$LT_PID" 2>/dev/null || kill "$LT_PID" 2>/dev/null && log "  ✓ localtunnel stopped" || log "  (already gone)"
  rm -f "$SESSION_FILE" "$DEV_LOG" "$LT_LOG"
  log "Done."
  exit 0
fi

# ─── guard against double-start ──────────────────────────────────────────────

if [[ -f "$SESSION_FILE" ]]; then
  echo "⚠️  A session already seems to be running."
  echo "   Run: ./scripts/tunnel.sh stop   to shut it down first."
  exit 1
fi

# ─── 1. start docs server ─────────────────────────────────────────────────────

log "Starting docs server..."
rm -f "$DEV_LOG"
npx mdts docs --no-open >"$DEV_LOG" 2>&1 &
DEV_PID=$!

log "Waiting for docs server to report its port..."
PORT=$(wait_for_line "$DEV_LOG" 'localhost:[0-9]+' 's/localhost://' "$TIMEOUT") \
  || { kill "$DEV_PID" 2>/dev/null; die "Docs server didn't report a port within ${TIMEOUT}s. Check $DEV_LOG."; }

log "Docs server is on port $PORT."

# ─── 2. start localtunnel with auto-restart ──────────────────────────────────
# localtunnel is unstable and drops connections. We wrap it in a loop so it
# reconnects automatically. A new URL is printed to the log on each restart.

log "Starting localtunnel on port $PORT (with auto-restart)..."
rm -f "$LT_LOG"

(
  # Run in its own process group so we can kill the whole group cleanly
  set -m
  attempt=0
  while true; do
    attempt=$(( attempt + 1 ))
    echo "[localtunnel] attempt #${attempt} starting..." >> "$LT_LOG"
    npx --yes localtunnel --port "$PORT" --local-host localhost >> "$LT_LOG" 2>&1 || true
    echo "[localtunnel] exited, restarting in 2s..." >> "$LT_LOG"
    sleep 2
  done
) &
LT_PID=$!

# Wait for the first URL to appear in the log
log "Waiting for localtunnel URL..."
TUNNEL_URL=$(wait_for_line "$LT_LOG" 'https://[a-z0-9-]+\.loca\.lt' 's/.*/&/' "$TIMEOUT") \
  || { kill "$DEV_PID" "$LT_PID" 2>/dev/null; die "localtunnel didn't report a URL within ${TIMEOUT}s. Check $LT_LOG."; }

log "Tunnel URL: $TUNNEL_URL"

# ─── 3. fetch password ───────────────────────────────────────────────────────

log "Fetching tunnel password..."
PASSWORD=$(curl -s https://loca.lt/mytunnelpassword) \
  || die "Failed to fetch tunnel password."

# ─── 4. save session + print summary ─────────────────────────────────────────

cat >"$SESSION_FILE" <<EOF
DEV_PID=$DEV_PID
LT_PID=$LT_PID
PORT=$PORT
TUNNEL_URL=$TUNNEL_URL
PASSWORD=$PASSWORD
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🌐  URL:       $TUNNEL_URL"
echo "  🔑  Password:  $PASSWORD"
echo "  💻  Local:     http://localhost:$PORT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Background PIDs: dev=$DEV_PID  lt=$LT_PID (restart wrapper)"
echo "  Logs:  npm run tunnel:logs"
echo "  Stop:  npm run tunnel:stop"
echo ""
