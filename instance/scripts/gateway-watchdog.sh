#!/bin/bash
# Gateway watchdog — restarts Alma if it crashes.
# Cron: */5 * * * * ~/.alma/scripts/gateway-watchdog.sh

ALMA_PORT="${ALMA_PORT:-18790}"
ALMA_DIR="${ALMA_DIR:-$HOME/.alma}"
LOG="$ALMA_DIR/logs/watchdog.log"

mkdir -p "$ALMA_DIR/logs"

# Check if Alma is responding
if curl -sf "http://localhost:$ALMA_PORT/health" > /dev/null 2>&1; then
  exit 0
fi

echo "$(date): Alma not responding on port $ALMA_PORT. Restarting..." >> "$LOG"

# Kill existing process if zombie
pkill -f "alma.*$ALMA_PORT" 2>/dev/null

# Restart
cd "$ALMA_DIR" && nohup node dist/index.js >> "$ALMA_DIR/logs/alma.log" 2>&1 &

echo "$(date): Restarted. PID: $!" >> "$LOG"
