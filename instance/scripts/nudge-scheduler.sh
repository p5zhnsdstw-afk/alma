#!/bin/bash
# Nudge scheduler — runs every 15 minutes during waking hours.
# Handles:
#   1. Task nudges (assigned tasks approaching due date)
#   2. Calendar connection nudges (Day 7 + Day 14 for WhatsApp-only users)
#   3. Deferred onboarding steps (home type Day 3, appliances Day 7)
#
# Cron: */15 8-21 * * * ~/.alma/scripts/nudge-scheduler.sh

set -euo pipefail

ALMA_DIR="${ALMA_DIR:-$HOME/.alma}"
DATA_DIR="$ALMA_DIR/data"
MASTER_DB="$DATA_DIR/alma-master.db"
LOG="$ALMA_DIR/logs/nudge.log"
ALMA_PORT="${ALMA_PORT:-18790}"

mkdir -p "$ALMA_DIR/logs"

if [ ! -f "$MASTER_DB" ]; then
  exit 0
fi

# Check if Alma is running
if ! curl -sf "http://localhost:$ALMA_PORT/health" > /dev/null 2>&1; then
  echo "$(date): Alma not running, skipping nudges" >> "$LOG"
  exit 0
fi

echo "$(date): Running nudge cycle" >> "$LOG"

# 1. Task nudges — for all active families
# TODO: call Alma API endpoint
# curl -s -X POST "http://localhost:$ALMA_PORT/api/nudge/tasks" >> "$LOG" 2>&1

# 2. Calendar connection nudges (runs once at day 7 and day 14, then stops)
# TODO: call Alma API endpoint
# curl -s -X POST "http://localhost:$ALMA_PORT/api/nudge/calendar" >> "$LOG" 2>&1

# 3. Deferred onboarding (home type at day 3, appliances at day 7)
# TODO: call Alma API endpoint
# curl -s -X POST "http://localhost:$ALMA_PORT/api/nudge/onboarding" >> "$LOG" 2>&1

echo "$(date): Nudge cycle complete" >> "$LOG"
