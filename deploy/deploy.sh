#!/bin/bash
# Deploy Alma to macvieja (100.77.224.43)
# Usage: npm run deploy

set -euo pipefail

REMOTE="macvieja"
REMOTE_DIR="/home/colo/.alma"
LOCAL_DIR="$(dirname "$0")/.."
SERVICE_NAME="alma"

echo "Building..."
cd "$LOCAL_DIR"
npm run build

echo "Deploying to $REMOTE:$REMOTE_DIR..."

# Sync built files + instance config
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'data' \
  --exclude '.env' \
  --exclude 'src' \
  --exclude '.git' \
  dist/ "$REMOTE:$REMOTE_DIR/dist/"

rsync -avz \
  package.json package-lock.json \
  "$REMOTE:$REMOTE_DIR/"

rsync -avz \
  instance/workspace/ "$REMOTE:$REMOTE_DIR/workspace/"

rsync -avz \
  instance/scripts/ "$REMOTE:$REMOTE_DIR/scripts/"

# Install deps on remote
ssh "$REMOTE" "cd $REMOTE_DIR && npm install --production"

# Make scripts executable
ssh "$REMOTE" "chmod +x $REMOTE_DIR/scripts/*.sh"

# Ensure logs directory exists
ssh "$REMOTE" "mkdir -p $REMOTE_DIR/logs"

# Install systemd service if not present (or update it)
rsync -avz deploy/alma.service "$REMOTE:/tmp/alma.service"
ssh "$REMOTE" "sudo cp /tmp/alma.service /etc/systemd/system/$SERVICE_NAME.service && sudo systemctl daemon-reload && sudo systemctl enable $SERVICE_NAME"

# Restart via systemd (graceful: SIGTERM → drain → stop)
ssh "$REMOTE" "sudo systemctl restart $SERVICE_NAME"

# Wait and verify health
sleep 3
HEALTH=$(ssh "$REMOTE" "curl -s http://localhost:18790/health 2>/dev/null || echo '{\"ok\":false}'")
echo "Health check: $HEALTH"

echo "Deployed. Alma running on $REMOTE via systemd."
echo "  Logs:    ssh $REMOTE journalctl -u $SERVICE_NAME -f"
echo "  Status:  ssh $REMOTE sudo systemctl status $SERVICE_NAME"
echo "  Restart: ssh $REMOTE sudo systemctl restart $SERVICE_NAME"
