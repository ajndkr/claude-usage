# claude-usage

**Track your Claude Code / claude.ai usage limits from the terminal.** Zero
dependencies, no API key — just log in through your browser with your claude.ai
Pro/Max account, exactly like Claude Code. Get set up in three commands:

```sh
pnpm link --global      # install the `claude-usage` binary
claude-usage login      # log in via browser (opens claude.ai)
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
claude-usage                  # live widget: auto-refresh every 60s ([r] refresh, [q] quit)
claude-usage --once           # print usage once and exit (for scripts/cron)
claude-usage --json           # raw JSON response, once
claude-usage login            # log in via browser (claude.ai Pro/Max account)
claude-usage login --manual   # browser login without a local server (copy/paste the code)
claude-usage logout           # remove saved credentials
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

### Uninstall

```sh
claude-usage logout                       # remove saved credentials first (optional)
pnpm uninstall --global claude-usage      # remove the global binary
rm -rf ~/.config/claude-usage             # remove stored tokens + config dir
```

If you installed with `pnpm add -g .`, uninstall the same way (`pnpm uninstall -g claude-usage`).
If you only ever ran `node cli.js`, there's no binary to remove — just delete the repo and
`~/.config/claude-usage`.

## Logging in

`claude-usage login` runs the same OAuth flow Claude Code uses:

1. It opens `https://claude.ai/oauth/authorize` in your browser (and prints the URL
   in case it can't open automatically).
2. You approve the login with your claude.ai **Pro/Max** account.
3. claude.ai redirects back to a short-lived local server, which captures the
   authorization code and exchanges it for an access + refresh token.

Tokens are stored at `~/.config/claude-usage/auth.json` with `0600` permissions and
are refreshed automatically when they expire — you normally log in once.

- **Headless / SSH / no browser on this machine?** Use `claude-usage login --manual`:
  open the printed URL on any device, approve, then paste the code back.
- **Already have a Claude Code token?** Set `$CLAUDE_CODE_OAUTH_TOKEN` and skip `login`.

## How it works

After login it reads usage from the same OAuth endpoint Claude Code uses:

`GET https://api.anthropic.com/api/oauth/usage`

- Authenticated with the OAuth **access token** (`Authorization: Bearer …`), obtained
  via OAuth 2.0 + PKCE against `claude.ai` — no API key, no cookie.
- The response reports `utilization` (0–100%) and `resets_at` per window
  (`five_hour`, `seven_day`, and per-model weekly windows when present).
- Requires the `user:profile` scope and a `claude-code/*` User-Agent (the endpoint
  rate-limits unknown clients aggressively).

## Notes & limitations

- **Unofficial.** This uses private, undocumented endpoints that can change or break
  at any time.
- OAuth access tokens are short-lived but refreshed automatically; if refresh fails,
  re-run `claude-usage login`.

## License

MIT
