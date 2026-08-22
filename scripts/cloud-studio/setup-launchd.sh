#!/bin/bash
# Setup script for Cloud Studio auto-checkin launchd service
# This creates a macOS LaunchAgent that runs at login and every 24h

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$(which node)"
PLIST_NAME="com.inside-china-ai.cloudstudio-checkin"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_DIR="$HOME/Library/Logs"
SCRIPT_PATH="$SCRIPT_DIR/checkin.mjs"

mkdir -p "$LOG_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_BIN}</string>
        <string>${SCRIPT_PATH}</string>
        <string>--daemon</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>StartInterval</key>
    <integer>86400</integer>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/cloudstudio-checkin.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/cloudstudio-checkin.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.nvm/versions/node/v24.12.0/bin</string>
    </dict>
</dict>
</plist>
EOF

echo "Created plist at: $PLIST_PATH"
echo ""
echo "To load the service:"
echo "  launchctl load $PLIST_PATH"
echo ""
echo "To start immediately:"
echo "  launchctl start $PLIST_NAME"
echo ""
echo "To stop:"
echo "  launchctl stop $PLIST_NAME"
echo ""
echo "To unload (disable):"
echo "  launchctl unload $PLIST_PATH"
echo ""
echo "IMPORTANT: First run 'node $SCRIPT_PATH --login' to login manually."
echo "Then load the service with launchctl."
