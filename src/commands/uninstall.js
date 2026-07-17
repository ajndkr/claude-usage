// `claude-usage uninstall`: remove everything install.sh created - the binary
// symlink, the install directory, saved credentials, and the macOS widget app.
//
// Safe to run from the installed binary: cli.js and its modules are already
// loaded into memory before this runs, so deleting the install dir mid-run is
// fine. From a source checkout the checkout itself is left untouched.

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_DIR, BIN_PATH, WIDGET_APP } from '../config.js';
import { green, dim, yellow } from '../colors.js';
import { resolveInstall } from '../self.js';

export function cmdUninstall({ cliPath } = {}) {
  const { installDir, managed } = resolveInstall(cliPath);

  const rm = (target, label) => {
    try {
      if (fs.lstatSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        console.error(green('✓ ') + dim('removed ') + label);
      }
    } catch { /* not present */ }
  };

  // Binary symlink: only remove it if it points back at this install.
  try {
    const st = fs.lstatSync(BIN_PATH);
    if (st.isSymbolicLink() && path.dirname(fs.realpathSync(BIN_PATH)) === installDir) {
      fs.rmSync(BIN_PATH);
      console.error(green('✓ ') + dim('removed ') + BIN_PATH);
    }
  } catch { /* no binary */ }

  if (managed) {
    rm(installDir, installDir);
  } else {
    console.error(yellow('note: ') + `left source checkout in place (${installDir}).`);
  }
  rm(CONFIG_DIR, `${CONFIG_DIR} (saved credentials)`);
  rm(WIDGET_APP, 'macOS widget app');

  console.error(green('✓ uninstalled.'));
}
