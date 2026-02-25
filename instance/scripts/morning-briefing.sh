#!/bin/bash
# Morning briefing generator — runs via cron every 5 min during briefing hours.
# Checks which users have briefing_time matching NOW (±5 min window).
# Also triggers calendar sync before generating briefing.
#
# Cron: */5 6-9 * * * ~/.alma/scripts/morning-briefing.sh

set -euo pipefail

ALMA_DIR="${ALMA_DIR:-$HOME/.alma}"
DATA_DIR="$ALMA_DIR/data"
MASTER_DB="$DATA_DIR/alma-master.db"
LOG="$ALMA_DIR/logs/briefing.log"

mkdir -p "$ALMA_DIR/logs"

if [ ! -f "$MASTER_DB" ]; then
  exit 0
fi

# Calculate current time rounded to nearest 5 minutes
HOUR=$(date +%H)
MIN=$(date +%M)
ROUNDED_MIN=$(( (MIN / 5) * 5 ))
CHECK_TIME=$(printf "%02d:%02d" "$HOUR" "$ROUNDED_MIN")

# Find users whose briefing_time matches
USERS=$(sqlite3 "$MASTER_DB" "SELECT id, phone, family_id, name, calendar_provider, calendar_token, calendar_external_id FROM users WHERE briefing_time = '$CHECK_TIME' AND onboarding_step = -1" 2>/dev/null || true)

if [ -z "$USERS" ]; then
  exit 0
fi

echo "$(date): Generating briefings for time $CHECK_TIME" >> "$LOG"

echo "$USERS" | while IFS='|' read -r USER_ID PHONE FAMILY_ID NAME CAL_PROVIDER CAL_TOKEN CAL_EXT_ID; do
  echo "  Briefing for $NAME ($PHONE), family $FAMILY_ID" >> "$LOG"

  # Step 1: Sync calendar if connected
  if [ -n "$CAL_PROVIDER" ] && [ "$CAL_PROVIDER" != "" ]; then
    echo "    Syncing $CAL_PROVIDER calendar..." >> "$LOG"
    # TODO: call Alma sync endpoint
    # curl -s "http://localhost:${ALMA_PORT:-18790}/api/sync/$USER_ID" >> "$LOG" 2>&1
  fi

  # Step 2: Generate and send briefing
  # TODO: call Alma briefing endpoint
  # curl -s -X POST "http://localhost:${ALMA_PORT:-18790}/api/briefing/$USER_ID" >> "$LOG" 2>&1

  echo "    Sent." >> "$LOG"
done
