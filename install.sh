#!/usr/bin/env bash
# claude-usage installer.
#
#   curl -fsSL https://raw.githubusercontent.com/ajndkr/claude-usage/main/install.sh | bash
#
# Downloads the repo into ~/.claude-usage and links the `claude-usage` binary
# into ~/.local/bin. Zero runtime dependencies beyond Node.js >= 18.
#
# Uninstall:
#
#   curl -fsSL https://raw.githubusercontent.com/ajndkr/claude-usage/main/install.sh | bash -s -- --uninstall

set -euo pipefail

REPO="ajndkr/claude-usage"
BRANCH="${CLAUDE_USAGE_BRANCH:-main}"
INSTALL_DIR="${CLAUDE_USAGE_HOME:-$HOME/.claude-usage}"
BIN_DIR="${CLAUDE_USAGE_BIN:-$HOME/.local/bin}"
BIN="$BIN_DIR/claude-usage"

# ── output helpers ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; RESET=""
fi
info() { printf '%s\n' "$*"; }
ok()   { printf '%s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
err()  { printf '%s✗%s %s\n' "$RED" "$RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

# ── uninstall ───────────────────────────────────────────────────────────────
if [ "${1:-}" = "--uninstall" ] || [ "${1:-}" = "uninstall" ]; then
  info "Removing claude-usage..."
  if [ -e "$BIN" ] || [ -L "$BIN" ]; then rm -f "$BIN"; ok "removed $BIN"; fi
  if [ -d "$INSTALL_DIR" ]; then rm -rf "$INSTALL_DIR"; ok "removed $INSTALL_DIR"; fi
  if [ -d "$HOME/.config/claude-usage" ]; then rm -rf "$HOME/.config/claude-usage"; ok "removed saved credentials (~/.config/claude-usage)"; fi
  if [ -d "$HOME/Applications/Claude Usage.app" ]; then rm -rf "$HOME/Applications/Claude Usage.app"; ok "removed macOS widget app"; fi
  ok "Uninstalled."
  exit 0
fi

# ── preflight ───────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js is required (>= 18). Install it from https://nodejs.org and re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
[ "$NODE_MAJOR" -ge 18 ] 2>/dev/null || die "Node.js >= 18 required (found $(node -v 2>/dev/null || echo none))."
command -v curl >/dev/null 2>&1 || die "curl is required."
command -v tar  >/dev/null 2>&1 || die "tar is required."

# ── download ────────────────────────────────────────────────────────────────
info "${BOLD}Installing claude-usage${RESET} into $INSTALL_DIR ..."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
TARBALL="https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz"
curl -fsSL "$TARBALL" | tar -xz -C "$TMP" --strip-components=1 \
  || die "download failed from $TARBALL"

rm -rf "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"
mv "$TMP" "$INSTALL_DIR"
trap - EXIT
chmod +x "$INSTALL_DIR/cli.js"

# ── link binary ─────────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/cli.js" "$BIN"
ok "linked $BIN"

# ── PATH hint ───────────────────────────────────────────────────────────────
case ":$PATH:" in
  *":$BIN_DIR:"*) ON_PATH=1 ;;
  *) ON_PATH=0 ;;
esac

info ""
ok "${BOLD}claude-usage installed.${RESET}"
if [ "$ON_PATH" -eq 0 ]; then
  info ""
  info "${DIM}$BIN_DIR is not on your PATH. Add it:${RESET}"
  info "  bash/zsh:  echo 'export PATH=\"\$HOME/.local/bin:\$PATH\"' >> ~/.profile"
  info "  fish:      fish_add_path \$HOME/.local/bin"
fi
info ""
info "Next steps:"
info "  claude-usage login    # log in via your browser"
info "  claude-usage          # launch the live usage widget"
