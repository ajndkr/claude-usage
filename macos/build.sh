#!/usr/bin/env bash
# Builds the Claude Usage widget into ~/Applications/Claude Usage.app.
#
# The widget shells out to the existing CLI, so it needs absolute paths to node
# and cli.js baked in at build time (a GUI app launched from Finder has a
# minimal PATH). These come from the CLI via env, with sensible fallbacks:
#   CLAUDE_USAGE_NODE  absolute path to the node binary  (default: `command -v node`)
#   CLAUDE_USAGE_CLI   absolute path to cli.js           (default: sibling ../cli.js)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NODE_BIN="${CLAUDE_USAGE_NODE:-$(command -v node || true)}"
CLI_JS="${CLAUDE_USAGE_CLI:-$HERE/../cli.js}"

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "error: node binary not found. Set CLAUDE_USAGE_NODE to its path." >&2
  exit 1
fi
if [ ! -f "$CLI_JS" ]; then
  echo "error: cli.js not found at $CLI_JS. Set CLAUDE_USAGE_CLI." >&2
  exit 1
fi
if ! command -v swiftc >/dev/null 2>&1; then
  echo "error: swiftc not found. Install the Xcode command line tools: xcode-select --install" >&2
  exit 1
fi

# Resolve to canonical absolute paths.
NODE_BIN="$(cd "$(dirname "$NODE_BIN")" && pwd)/$(basename "$NODE_BIN")"
CLI_JS="$(cd "$(dirname "$CLI_JS")" && pwd)/$(basename "$CLI_JS")"

APP="$HOME/Applications/Claude Usage.app"
MACOS_DIR="$APP/Contents/MacOS"
BIN="$MACOS_DIR/ClaudeUsageWidget"

echo "Building widget…"
echo "  node: $NODE_BIN"
echo "  cli:  $CLI_JS"
echo "  app:  $APP"

rm -rf "$APP"
mkdir -p "$MACOS_DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SRC="$TMP/main.swift" # must be main.swift for top-level app.run()

# Substitute the baked paths. Use | as the sed delimiter (paths contain /).
sed -e "s|__CLAUDE_USAGE_NODE__|$NODE_BIN|g" \
    -e "s|__CLAUDE_USAGE_CLI__|$CLI_JS|g" \
    "$HERE/ClaudeUsageWidget.swift" > "$SRC"

swiftc -O -o "$BIN" "$SRC"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Claude Usage</string>
  <key>CFBundleDisplayName</key><string>Claude Usage</string>
  <key>CFBundleIdentifier</key><string>dev.claudeusage.widget</string>
  <key>CFBundleExecutable</key><string>ClaudeUsageWidget</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Ad-hoc sign so macOS is happy launching a locally-built app.
codesign --force --sign - "$APP" >/dev/null 2>&1 || true

echo "Done. Launch with: claude-usage widget   (or open \"$APP\")"
