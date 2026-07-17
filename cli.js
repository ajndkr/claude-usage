#!/usr/bin/env node
// claude-usage - a minimal CLI to track claude.ai / Claude Code usage limits.
//
// Auth is a browser OAuth login, identical to how Claude Code signs in with a
// claude.ai subscription (Pro/Max) account: an OAuth 2.0 + PKCE flow against
// https://claude.ai/oauth/authorize. The resulting access token reads usage from
// GET https://api.anthropic.com/api/oauth/usage. No API key, no cookie.
//
// This file is the thin entry point: argument dispatch plus re-exports for tests.
// The implementation lives in ./src (config → colors → auth → oauth → usage →
// render → commands). See CLAUDE.md → Architecture.

import { fileURLToPath } from 'node:url';
import { die } from './src/colors.js';
import { cmdOnce } from './src/commands/once.js';
import { cmdWatch } from './src/commands/watch.js';
import { cmdLogin } from './src/commands/login.js';
import { cmdLogout } from './src/commands/logout.js';
import { cmdWidget } from './src/commands/widget.js';
import { cmdUpdate } from './src/commands/update.js';
import { cmdUninstall } from './src/commands/uninstall.js';
import { usage } from './src/commands/help.js';

// Re-exported for the test suite (import with CLAUDE_USAGE_NO_MAIN=1 set).
export { bar, fmtReset, render } from './src/render.js';
export { pkce, buildAuthUrl, normalizeTokens } from './src/oauth.js';

// ── main ──────────────────────────────────────────────────────────────────
if (process.env.CLAUDE_USAGE_NO_MAIN) {
  // imported for testing; skip CLI dispatch
} else {
await (async () => {
const args = process.argv.slice(2);
const arg = args[0];
switch (arg) {
  case 'login':
    await cmdLogin({ manual: args.includes('--manual') });
    break;
  case 'logout':
    cmdLogout();
    break;
  case 'widget':
    cmdWidget({ rebuild: args.includes('--rebuild'), cliPath: fileURLToPath(import.meta.url) });
    break;
  case 'update':
    cmdUpdate({ cliPath: fileURLToPath(import.meta.url) });
    break;
  case 'uninstall':
    cmdUninstall({ cliPath: fileURLToPath(import.meta.url) });
    break;
  case 'help':
  case '--help':
  case '-h':
    usage();
    break;
  case '--json':
    await cmdOnce(true);
    break;
  case '--once':
  case '-1':
    await cmdOnce(false);
    break;
  case undefined:
    // Default: live widget in a TTY; single snapshot when piped/redirected.
    if (process.stdout.isTTY) await cmdWatch();
    else await cmdOnce(false);
    break;
  default:
    die(`unknown command: ${arg}\nRun \`claude-usage help\`.`);
}
})();
}
