# claude-usage

**Track your Claude Code / claude.ai usage limits from the terminal.** Zero
dependencies, no API key: log in through your browser with your claude.ai Pro/Max
account, exactly like Claude Code.

```text
  Claude usage
  ────────────────────────────────────────────────────────────
  Session (5h)     █████████░░░░░░░░░░░░░░░░░░░  33%  resets in 3h 5m
  Weekly (7d)      ██░░░░░░░░░░░░░░░░░░░░░░░░░░   8%  resets in 3d 0h

  updated 16:26:34  ·  auto-refresh in 47s  ·  [r] refresh  [q] quit
```

## Install

Requires [Node.js](https://nodejs.org) 18 or newer. One command:

```sh
curl -fsSL https://raw.githubusercontent.com/ajndkr/claude-usage/main/install.sh | bash
```

This downloads the CLI into `~/.claude-usage` and links a `claude-usage` binary
into `~/.local/bin`. If that directory isn't on your `PATH`, the installer prints
the line to add.

Then log in and launch it:

```sh
claude-usage login      # opens claude.ai in your browser (approve with Pro/Max)
claude-usage            # live usage widget
```

Log in once: tokens are saved to `~/.config/claude-usage` and refreshed
automatically. On a headless box or over SSH, use `claude-usage login --manual`
and paste the code back. Already have a Claude Code token? Set
`$CLAUDE_CODE_OAUTH_TOKEN` and skip `login`.

## Usage

```sh
claude-usage          # live widget: auto-refresh every 60s ([r] refresh, [q] quit)
claude-usage --once   # print usage once and exit (for scripts/cron)
claude-usage help     # full list of commands
```

Run `claude-usage help` for everything else (`--json`, `login --manual`,
`logout`, `widget`, …). When output is piped or redirected, `claude-usage` prints
a single snapshot, so `claude-usage | …` and cron jobs work without `--once`.

### macOS desktop widget

`claude-usage widget` compiles a tiny native SwiftUI app to
`~/Applications/Claude Usage.app` (needs the Xcode command line tools:
`xcode-select --install`) and launches it: a borderless, always-on-top panel that
shows the same bars, floats on all Spaces, and can be dragged anywhere. Launch it
later from Spotlight ("Claude Usage"). If you update or move the CLI, run
`claude-usage widget --rebuild`.

## Update

```sh
claude-usage update
```

Pulls the latest CLI over your install and rebuilds the desktop widget if you
have one.

## Uninstall

```sh
claude-usage uninstall
```

Removes the binary, `~/.claude-usage`, saved credentials, and the macOS widget
app.

## How it works

`claude-usage` signs in with the same OAuth 2.0 + PKCE flow Claude Code uses (no
API key, no cookie) and reads usage from the OAuth usage endpoint. It relies on
private, undocumented endpoints that can change at any time.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the OAuth flow, the usage
endpoint, module layout, and how to run without installing (`node cli.js`).

## License

MIT
