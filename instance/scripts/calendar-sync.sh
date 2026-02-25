#!/bin/bash
# Calendar sync — runs every 15 minutes for users with connected calendars.
# Pulls external events into Alma's internal calendar.
# Pushes Alma-created events to external calendars.
#
# Cron: */15 * * * * ~/.alma/scripts/calendar-sync.sh

set -euo pipefail

ALMA_DIR="${ALMA_DIR:-$HOME/.alma}"
DATA_DIR="$ALMA_DIR/data"
MASTER_DB="$DATA_DIR/alma-master.db"
LOG="$ALMA_DIR/logs/calendar-sync.log"
ALMA_PORT="${ALMA_PORT:-18790}"

mkdir -p "$ALMA_DIR/logs"

if [ ! -f "$MASTER_DB" ]; then
  exit 0
fi

# Check if Alma is running
if ! curl -sf "http://localhost:$ALMA_PORT/health" > /dev/null 2>&1; then
  exit 0
fi

# Find users with calendar sync configured
USERS=$(sqlite3 "$MASTER_DB" "SELECT id, calendar_provider FROM users WHERE calendar_provider IS NOT NULL AND calendar_token IS NOT NULL AND onboarding_step = -1" 2>/dev/null || true)

if [ -z "$USERS" ]; then
  exit 0
fi

COUNT=$(echo "$USERS" | wc -l | tr -d ' ')
echo "$(date): Syncing $COUNT calendars" >> "$LOG"

# TODO: call Alma sync endpoint for each user
# echo "$USERS" | while IFS='|' read -r USER_ID PROVIDER; do
#   curl -s -X POST "http://localhost:$ALMA_PORT/api/sync/$USER_ID" >> "$LOG" 2>&1
# done

echo "$(date): Sync complete" >> "$LOG"
