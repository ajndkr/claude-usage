# Architecture

A minimal, zero-dependency CLI that shows claude.ai / Claude Code usage limits. Auth is a browser OAuth login (OAuth 2.0 + PKCE against claude.ai, the same flow Claude Code uses with a Pro/Max subscription). No API key, no cookie.

## Running from source

No build step. Clone the repo and run `node cli.js` (same subcommands as the installed `claude-usage` binary). `node --check cli.js` syntax-checks it. The `install.sh` one-liner in the README just automates this: it downloads the repo tarball into `~/.claude-usage` and symlinks `cli.js` into `~/.local/bin/claude-usage` (no npm/pnpm involved). `pnpm link --global` also works if you prefer a package-manager-managed binary.

## Layout

ESM, Node ≥18, built-in `fetch` + `node:http`/`node:crypto`/`node:child_process` only (zero deps). `cli.js` is a **thin entry point**: argument dispatch + re-exports for tests. The implementation is split into focused modules under `src/`, one per layer (top to bottom in the dependency graph):

- `src/config.js`: constants read from env at load (endpoints, OAuth client, paths, `REFRESH_SECS`). No deps.
- `src/colors.js`: ANSI helpers (`bold`/`dim`/`red`/…), `useColor`, and `die`.
- `src/auth.js`: token storage (`loadAuth`/`saveAuth`) + the `requireAuth` guard.
- `src/oauth.js`: PKCE/OAuth (`pkce`/`buildAuthUrl`/`normalizeTokens`/`exchangeCode`/`refreshOAuth`). Depends on `auth` (for `saveAuth`).
- `src/usage.js`: `fetchUsage` (networking + refresh). Depends on `oauth`.
- `src/render.js`: `bar`/`fmtReset`/`WINDOW_LABELS`/`render`. Depends on `colors`.
- `src/self.js`: `resolveInstall(cliPath)` - resolves where the CLI lives (through the `~/.local/bin` symlink) and whether it's an install.sh install (`INSTALL_HOME`) vs a source checkout. Used only by `update`/`uninstall`.
- `src/commands/*.js`: one file per command: `once`, `watch`, `login`, `logout`, `widget`, `update`, `uninstall`, `help`.

The dependency graph is acyclic (`config` and `colors` are leaves; commands sit at the top). When adding a command, add a `src/commands/<name>.js` and wire one `case` in `cli.js`.

## Self-management (`update` / `uninstall`)

`update` and `uninstall` manage an install.sh installation and must stay in sync with `install.sh` (same `INSTALL_HOME`, `BIN_PATH`, `WIDGET_APP`, repo slug/branch, all in `src/config.js`). Both take `cliPath` (from `cli.js`'s `import.meta.url`) and call `resolveInstall` to decide if this is a managed install:

- `update` refuses on a source checkout; otherwise it re-downloads the repo tarball (curl + tar, mirroring install.sh) into a temp dir on the same filesystem as `INSTALL_HOME`, atomically renames it over the install, re-links the binary, and rebuilds the widget only if the app already exists. It's safe to delete/replace the running install: `cli.js` imports every command statically, so all modules are in memory before the command runs.
- `uninstall` removes the binary symlink (only if it points back at this install), the install dir (only if managed - a checkout is left for git), the credentials dir, and the widget app.

## macOS widget

The macOS widget lives in `macos/`: `ClaudeUsageWidget.swift` (a borderless, always-on-top SwiftUI `NSPanel`) and `build.sh` (compiles it into `~/Applications/Claude Usage.app`). The widget is a **pure renderer**: it never touches auth/OAuth. It shells out to `<node> <cli.js> --json` and draws the result, so all logic stays in the Node modules. `build.sh` bakes absolute paths to node + cli.js into the Swift source (placeholders `__CLAUDE_USAGE_NODE__` / `__CLAUDE_USAGE_CLI__`) because a Finder-launched GUI app has a minimal PATH. `cmdWidget` (in `src/commands/widget.js`) builds the app on first run: the caller (`cli.js`) passes `cliPath` from its own `import.meta.url`, and `cmdWidget` passes node + cli paths to the build via `CLAUDE_USAGE_NODE`/`CLAUDE_USAGE_CLI`, then `open`s it. Keep `WINDOW_LABELS` and the color thresholds (70/90%) in sync between `src/render.js` and the Swift file.

## Key facts to preserve when editing

- **Auth model:** `loadAuth()` returns `{accessToken, refreshToken, expiresAt}` or null. Precedence: `$CLAUDE_CODE_OAUTH_TOKEN`, then `auth.json`. Tokens are stored at `~/.config/claude-usage/auth.json` (0600).
- **OAuth flow (must match Claude Code's public client):** authorize at `https://claude.ai/oauth/authorize` with `client_id` `9d1c250a-e61b-44d9-88ed-5944d1962f5e`, `response_type=code`, PKCE `S256`, scope `user:profile user:inference` (the `user:profile` scope is what the usage endpoint requires). Loopback flow uses a `http://localhost:<port>/callback` redirect + local server; manual flow uses `https://console.anthropic.com/oauth/code/callback` + `code=true` and pastes `code#state`. Token exchange/refresh POST JSON to `console.anthropic.com/v1/oauth/token`.
- **Usage endpoint:** `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer`, `anthropic-beta: oauth-2025-04-20`, and a `claude-code/*` User-Agent (unknown UAs hit an aggressive 429 bucket, so don't drop it). Response has per-window `{ utilization (0-100), resets_at }` for `five_hour`, `seven_day`, and per-model weekly keys (see `WINDOW_LABELS`); other fields are ignored.
- **Token refresh:** `fetchUsage` refreshes proactively (within 60s of `expiresAt`) and reactively (once on a 401/403), persisting new tokens via `saveAuth`. `refreshOAuth` mutates the passed `auth` object in place so the watch loop keeps using fresh tokens. A missing refresh token (e.g. `$CLAUDE_CODE_OAUTH_TOKEN`) gives an error telling the user to re-`login`.
- **`fetchUsage` throws** (never calls `die`) so the watch loop can survive transient errors and keep the last good reading. One-shot callers catch and `die`.
- **TTY branching:** default is the live widget only when `process.stdout.isTTY`; otherwise a single snapshot, so pipes/cron work without `--once`.
- **Watch loop (`cmdWatch` in `src/commands/watch.js`):** 1s ticker drives the countdown/redraw; data refetch is every `REFRESH_SECS` (60). Draws in place via cursor-home + clear-below. `cleanup()` must restore the cursor and raw mode on every exit path (`q`/Ctrl-C/Esc, SIGINT/SIGTERM). Don't poll faster than 60s.

## Testing

No framework. `cli.js` re-exports the pure functions (`bar`, `fmtReset`, `render` from `src/render.js`; `pkce`, `buildAuthUrl`, `normalizeTokens` from `src/oauth.js`). Import with `CLAUDE_USAGE_NO_MAIN=1` set to skip CLI dispatch. Modules under `src/` can also be imported directly (they have no top-level side effects beyond reading env constants). Override endpoints to point at a local mock server: `CLAUDE_USAGE_API_BASE` (usage), `CLAUDE_USAGE_TOKEN_URL` (token exchange/refresh), `CLAUDE_USAGE_AUTHORIZE_URL` (authorize). Setting `HOME` to a temp dir isolates the `~/.config/claude-usage` credential file during tests.
