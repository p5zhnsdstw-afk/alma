#!/bin/bash
# Deploy Alma to macvieja (100.77.224.43)
# Usage: npm run deploy

set -euo pipefail

REMOTE="macvieja"
REMOTE_DIR="~/.alma"
LOCAL_DIR="$(dirname "$0")/.."

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

# Restart
ssh "$REMOTE" "pkill -f 'node.*alma' 2>/dev/null; cd $REMOTE_DIR && nohup node dist/index.js > logs/alma.log 2>&1 &"

echo "Deployed. Alma running on $REMOTE."
