# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A minimal, zero-dependency CLI that shows claude.ai / Claude Code usage limits. Auth is a browser OAuth login (OAuth 2.0 + PKCE against claude.ai, the same flow Claude Code uses with a Pro/Max subscription). No API key, no cookie.

## Commands

- `node cli.js` - run the live widget (or a single snapshot when stdout isn't a TTY)
- `node cli.js --once` / `--json` - one-shot render / raw JSON
- `node cli.js login` - browser OAuth login (`--manual` for copy/paste on headless boxes)
- `node cli.js logout` - remove saved credentials
- `pnpm link --global` - install the `claude-usage` binary (pnpm, not npm)
- `node --check cli.js` - syntax check (no build, no lint, no test suite)

## Architecture

Everything lives in `cli.js` (ESM, Node ≥18, built-in `fetch` + `node:http`/`node:crypto`/`node:child_process`). Layers, top to bottom: auth storage (`loadAuth`/`saveAuth`) → OAuth/PKCE (`pkce`/`buildAuthUrl`/`exchangeCode`/`refreshOAuth`) → networking (`fetchUsage`) → rendering (`bar`/`render`) → commands (`cmdOnce`/`cmdWatch`/`cmdLogin`/`cmdLogout`) → arg dispatch.

Key facts to preserve when editing:

- **Auth model:** `loadAuth()` returns `{accessToken, refreshToken, expiresAt}` or null. Precedence: `$CLAUDE_CODE_OAUTH_TOKEN` → `auth.json`. Tokens are stored at `~/.config/claude-usage/auth.json` (0600).
- **OAuth flow (must match Claude Code's public client):** authorize at `https://claude.ai/oauth/authorize` with `client_id` `9d1c250a-e61b-44d9-88ed-5944d1962f5e`, `response_type=code`, PKCE `S256`, scope `user:profile user:inference` (the `user:profile` scope is what the usage endpoint requires). Loopback flow uses a `http://localhost:<port>/callback` redirect + local server; manual flow uses `https://console.anthropic.com/oauth/code/callback` + `code=true` and pastes `code#state`. Token exchange/refresh POST JSON to `console.anthropic.com/v1/oauth/token`.
- **Usage endpoint:** `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer`, `anthropic-beta: oauth-2025-04-20`, and a `claude-code/*` User-Agent (unknown UAs hit an aggressive 429 bucket — don't drop it). Response has per-window `{ utilization (0–100), resets_at }` for `five_hour`, `seven_day`, and per-model weekly keys (see `WINDOW_LABELS`); other fields are ignored.
- **Token refresh:** `fetchUsage` refreshes proactively (within 60s of `expiresAt`) and reactively (once on a 401/403), persisting new tokens via `saveAuth`. `refreshOAuth` mutates the passed `auth` object in place so the watch loop keeps using fresh tokens. A missing refresh token (e.g. `$CLAUDE_CODE_OAUTH_TOKEN`) → error telling the user to re-`login`.
- **`fetchUsage` throws** (never calls `die`) so the watch loop can survive transient errors and keep the last good reading. One-shot callers catch and `die`.
- **TTY branching:** default is the live widget only when `process.stdout.isTTY`; otherwise a single snapshot, so pipes/cron work without `--once`.
- **Widget loop (`cmdWatch`):** 1s ticker drives the countdown/redraw; data refetch is every `REFRESH_SECS` (60). Draws in place via cursor-home + clear-below. `cleanup()` must restore the cursor and raw mode on every exit path (`q`/Ctrl-C/Esc, SIGINT/SIGTERM). Don't poll faster than 60s.

## Testing

No framework. `cli.js` exports pure functions (`bar`, `fmtReset`, `render`, `pkce`, `buildAuthUrl`, `normalizeTokens`) - import with `CLAUDE_USAGE_NO_MAIN=1` set to skip CLI dispatch. Override endpoints to point at a local mock server: `CLAUDE_USAGE_API_BASE` (usage), `CLAUDE_USAGE_TOKEN_URL` (token exchange/refresh), `CLAUDE_USAGE_AUTHORIZE_URL` (authorize). Setting `HOME` to a temp dir isolates the `~/.config/claude-usage` credential file during tests.
