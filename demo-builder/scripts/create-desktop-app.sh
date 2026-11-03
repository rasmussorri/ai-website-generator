#!/usr/bin/env bash
# Creates "Demo Builder.app" on the Desktop.
# Double-clicking it starts the local dashboard and opens the browser automatically.
#
# Run once after cloning:
#   npm run setup:app

set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Demo Builder"
APP_PATH="$HOME/Desktop/$APP_NAME.app"

echo ""
echo "Creating $APP_NAME.app on your Desktop..."

# Resolve the npm binary (handles nvm / Homebrew / system installs)
NPM_BIN="$(command -v npm 2>/dev/null || echo "")"
if [[ -z "$NPM_BIN" ]]; then
  # Common Homebrew/nvm paths as fallback
  for candidate in \
      "/opt/homebrew/bin/npm" \
      "/usr/local/bin/npm" \
      "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -1)/bin/npm"; do
    if [[ -x "$candidate" ]]; then NPM_BIN="$candidate"; break; fi
  done
fi

if [[ -z "$NPM_BIN" ]]; then
  echo "❌  npm not found. Install Node.js from https://nodejs.org first."
  exit 1
fi

# Write the AppleScript and compile it into a .app bundle
osacompile -o "$APP_PATH" << APPLESCRIPT
on run
  set demoDir to "$DEMO_DIR"
  set npmBin to "$NPM_BIN"

  tell application "Terminal"
    -- Reuse an existing window if one is open, otherwise open a new one
    if (count of windows) is 0 then
      do script "cd " & quoted form of demoDir & " && " & quoted form of npmBin & " run dev"
    else
      do script "cd " & quoted form of demoDir & " && " & quoted form of npmBin & " run dev" in window 1
    end if
    activate
  end tell

  -- Poll port 3000 in the background; open the browser the moment it responds
  do shell script "(while ! nc -z localhost 3000 2>/dev/null; do sleep 1; done; open 'http://localhost:3000/dashboard') > /dev/null 2>&1 &"
end run
APPLESCRIPT

echo "✅  $APP_NAME.app created!"
echo ""
echo "   Drag it to your Dock or double-click it from the Desktop."
echo "   The first launch may ask for permission to control Terminal — click OK."
echo ""
