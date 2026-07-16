# claude-usage

**Track your Claude Code / claude.ai usage limits from the terminal.** Zero
dependencies, no API key - just your browser session cookie. Get set up in three
commands:

```sh
pnpm link --global      # install the `claude-usage` binary
claude-usage login      # paste your claude.ai cookie once
claude-usage            # launch the live usage widget
```

`claude-usage` runs as a **live widget**: session (5h) and weekly (7d) windows with
reset countdowns, auto-refreshing every 60s. Press **`r`** to refresh now, **`q`** to
quit.

```text
  Claude usage
  ────────────────────────────────────────────────────────────
  Session (5h)     █████████░░░░░░░░░░░░░░░░░░░  33%  resets in 3h 5m
  Weekly (7d)      ██░░░░░░░░░░░░░░░░░░░░░░░░░░   8%  resets in 3d 0h

  updated 16:26:34  ·  auto-refresh in 47s  ·  [r] refresh  [q] quit
```

## Commands

```sh
claude-usage            # live widget: auto-refresh every 60s ([r] refresh, [q] quit)
claude-usage --once     # print usage once and exit (for scripts/cron)
claude-usage --json     # raw JSON response, once
claude-usage login      # save/update your session cookie
claude-usage help
```

When output is piped or redirected (not a TTY), `claude-usage` prints a single
snapshot instead of the live widget — so `claude-usage | …` and cron jobs behave
sensibly without needing `--once`.

## Install

Requires Node.js ≥ 18 and [pnpm](https://pnpm.io).

```sh
git clone <this-repo> && cd claude-usage
pnpm link --global      # or: pnpm add -g .
```

Or run directly without installing: `node cli.js`.

## Getting your cookie

`claude-usage login` prompts for your claude.ai cookie. To find it:

1. Open <https://claude.ai/settings/usage> in your browser (logged in).
2. Open DevTools (`Cmd+Option+I`) → **Network** tab, then refresh the page.
3. Click the **`usage`** request → **Headers** → **Request Headers**.
4. Copy the entire value of the **`Cookie`** header and paste it into the prompt.

The cookie is stored at `~/.config/claude-usage/cookie` with `0600` permissions.
Alternatively, set `$CLAUDE_COOKIE` (e.g. from a secrets manager) and skip `login`.

## How it works

It calls the same private endpoint the claude.ai usage page uses,
`GET https://claude.ai/api/organizations/<org-uuid>/usage`:

- The `lastActiveOrg` cookie holds your organization UUID; it's parsed to build the
  request URL.
- The `sessionKey` cookie authenticates the request. It's the equivalent of your
  password - treat it as a secret.
- The response reports `utilization` (0–100%) and `resets_at` per window
  (`five_hour`, `seven_day`, and per-model weekly windows when present).

## Notes & limitations

- **Unofficial.** This uses a private, undocumented endpoint that can change or break
  at any time.
- Session cookies expire; re-run `claude-usage login` when you see an auth error.
- claude.ai is behind Cloudflare. The CLI sends a browser-like `User-Agent`, and the
  `cf_clearance` cookie you copy is tied to your IP + User-Agent. If you get a 403,
  copy a fresh cookie right after loading claude.ai in the **same** browser.

## License

MIT
