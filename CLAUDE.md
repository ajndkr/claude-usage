# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A minimal, zero-dependency CLI that shows claude.ai / Claude Code usage limits, authed via browser OAuth (no API key, no cookie).

## Conventions

- **No em-dashes.** Do not use `—` (or `–`) anywhere: code, comments, docs, commit messages, or prose. Use a colon, a hyphen with spaces (` - `), parentheses, or two sentences instead.

### Commits

Commit subject format: `type: description`.

- Subject line under 72 characters.
- Description starts with an action verb: `add`, `fix`, `update`, `remove`, `refactor`, etc.
- No commit body and no `Co-Authored-By` trailer unless the user explicitly asks.
- Never amend a commit or force-push unless the user explicitly asks.

Types: `feat` (new capability), `fix` (bug fix), `refactor` (no behavior change), `chore` (deps, configs, cleanup), `build` (build/CI), `docs` (docs only). This is a single-package repo, so commits omit a scope.

Examples:

```text
feat: add macOS desktop widget
fix: restore cursor on watch-loop exit
refactor: split cli.js into focused src/ modules
docs: move architecture notes into docs/ARCHITECTURE.md
```

## Commands

- `node cli.js` - run the live terminal widget (or a single snapshot when stdout isn't a TTY)
- `node cli.js --once` / `--json` - one-shot render / raw JSON
- `node cli.js login` - browser OAuth login (`--manual` for copy/paste on headless boxes)
- `node cli.js logout` - remove saved credentials
- `node cli.js widget` - macOS: build (first run) + launch the floating desktop widget; `--rebuild` re-bakes paths
- `pnpm link --global` - install the `claude-usage` binary (pnpm, not npm)
- `node --check cli.js` - syntax check (no build, no lint, no test suite)
- `bash macos/build.sh` - compile the widget `.app` directly (env `CLAUDE_USAGE_NODE`, `CLAUDE_USAGE_CLI`)

## Architecture

Zero-dependency ESM (Node ≥18). `cli.js` is a thin entry point; logic lives in focused `src/` modules and the macOS widget in `macos/`. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module layout, OAuth/usage/auth details, the watch loop, and testing. Read it before making non-trivial changes.
