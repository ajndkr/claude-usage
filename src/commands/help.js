// Usage/help text.

import { AUTH_FILE } from '../config.js';
import { bold } from '../colors.js';

export function usage() {
  console.log(
    [
      bold('claude-usage') + ' - track your claude.ai / Claude Code usage limits',
      '',
      'Usage:',
      '  claude-usage            Live terminal widget - auto-refresh every 60s ([r] refresh, [q] quit)',
      '  claude-usage widget     Launch the macOS desktop widget (floating, always-on-top panel)',
      '  claude-usage widget --rebuild   Rebuild the widget .app (after updating/moving the CLI)',
      '  claude-usage --once     Print usage once and exit (for scripts/cron)',
      '  claude-usage --json     Print the raw JSON response once and exit',
      '  claude-usage login      Log in via browser (claude.ai Pro/Max account)',
      '  claude-usage login --manual   Browser login without a local server (copy/paste code)',
      '  claude-usage logout     Remove saved credentials',
      '  claude-usage update     Update the CLI (and rebuild the widget if installed)',
      '  claude-usage uninstall  Remove the CLI, credentials, and widget',
      '  claude-usage help       Show this help',
      '',
      'Auth: reads $CLAUDE_CODE_OAUTH_TOKEN, or the credentials saved by `login` at',
      '  ' + AUTH_FILE,
    ].join('\n')
  );
}
