# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A minimal, zero-dependency CLI that shows claude.ai / Claude Code usage limits by calling the same private endpoint the claude.ai usage page uses, authenticated with the user's browser session cookie (no API key).

## Commands

- `node cli.js` - run the live widget (or a single snapshot when stdout isn't a TTY)
- `node cli.js --once` / `--json` - one-shot render / raw JSON
- `node cli.js login` - save the session cookie
- `pnpm link --global` - install the `claude-usage` binary (pnpm, not npm)
- `node --check cli.js` - syntax check (no build, no lint, no test suite)

## Architecture

Everything lives in `cli.js` (ESM, Node ≥18, built-in `fetch` only). Layers, top to bottom: cookie handling → networking (`fetchUsage`) → rendering (`bar`/`render`) → commands (`cmdOnce`/`cmdWatch`/`cmdLogin`) → arg dispatch.

Key facts to preserve when editing:

- **Endpoint & auth:** `GET https://claude.ai/api/organizations/<org-uuid>/usage`. The org UUID is parsed from the `lastActiveOrg` cookie; `sessionKey` authenticates. Response has per-window `{ utilization (0–100), resets_at }` for `five_hour`, `seven_day`, and per-model weekly keys (see `WINDOW_LABELS`); Anthropic codename fields are ignored.
- **`fetchUsage` throws** (never calls `die`) so the watch loop can survive transient errors and keep the last good reading. One-shot callers catch and `die`.
- **TTY branching:** default is the live widget only when `process.stdout.isTTY`; otherwise a single snapshot, so pipes/cron work without `--once`.
- **Widget loop (`cmdWatch`):** 1s ticker drives the countdown/redraw; data refetch is every `REFRESH_SECS` (60). Draws in place via cursor-home + clear-below. `cleanup()` must restore the cursor and raw mode on every exit path (`q`/Ctrl-C/Esc, SIGINT/SIGTERM).
- **Cloudflare:** a browser-like `USER_AGENT` is sent deliberately (`cf_clearance` is tied to IP+UA). Don't drop it. Don't poll faster than 60s.

## Testing

No framework. `cli.js` exports pure functions (`orgIdFromCookie`, `bar`, `fmtReset`, `render`) - import with `CLAUDE_USAGE_NO_MAIN=1` set to skip CLI dispatch. `CLAUDE_USAGE_BASE` overrides the API base for pointing at a local mock server.
