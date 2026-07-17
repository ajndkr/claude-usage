// macOS floating-panel widget: build the .app on first run (or with --rebuild),
// then launch it. The app itself just shells out to `claude-usage --json`, so
// all auth/networking lives in the CLI; the widget only renders.
//
// `cliPath` is the absolute path to the CLI entry (cli.js). The caller passes it
// (from its own import.meta.url) so the build can bake it into the Swift app and
// locate macos/build.sh next to it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { green, dim, die } from '../colors.js';

export function cmdWidget({ rebuild = false, cliPath } = {}) {
  if (process.platform !== 'darwin') {
    die('the widget is macOS-only. On other platforms use the terminal widget (`claude-usage`).');
  }
  const repoRoot = path.dirname(cliPath);
  const buildScript = path.join(repoRoot, 'macos', 'build.sh');
  const appPath = path.join(os.homedir(), 'Applications', 'Claude Usage.app');

  if (!fs.existsSync(buildScript)) {
    die(`widget build script not found at ${buildScript}.`);
  }
  if (rebuild || !fs.existsSync(appPath)) {
    const r = spawnSync('bash', [buildScript], {
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_USAGE_NODE: process.execPath, CLAUDE_USAGE_CLI: cliPath },
    });
    if (r.status !== 0) die('widget build failed (see output above).');
  }
  const r = spawnSync('open', [appPath], { stdio: 'inherit' });
  if (r.status !== 0) die(`could not launch the widget at ${appPath}.`);
  console.error(green('✓ Widget launched.') + dim(' It floats on top of the main desktop. Click × to close.'));
}
