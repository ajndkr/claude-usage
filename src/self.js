// Shared helpers for the self-management commands (`update`/`uninstall`).
//
// Both need to know whether this CLI was installed by install.sh (into
// INSTALL_HOME) versus run from a source checkout (`node cli.js`). We only ever
// delete or overwrite a managed install; a checkout is left for git to manage.

import fs from 'node:fs';
import path from 'node:path';
import { INSTALL_HOME } from './config.js';

// Resolve a path through symlinks; fall back to the literal path if it's missing.
function real(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

// Where this cli.js actually lives (following the ~/.local/bin symlink) and
// whether that matches the install.sh install directory.
export function resolveInstall(cliPath) {
  const installDir = real(path.dirname(cliPath));
  const managed = installDir === real(INSTALL_HOME);
  return { installDir, managed };
}
