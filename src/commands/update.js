// `claude-usage update`: re-download the latest CLI over this install and, on
// macOS, rebuild the desktop widget if it was built. Mirrors install.sh (curl +
// tar), so it only manages an install.sh installation, not a source checkout.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_SLUG, REPO_BRANCH, BIN_PATH, WIDGET_APP } from '../config.js';
import { green, dim, die } from '../colors.js';
import { resolveInstall } from '../self.js';

export function cmdUpdate({ cliPath } = {}) {
  const { installDir, managed } = resolveInstall(cliPath);
  if (!managed) {
    die(`not an install.sh installation (running from ${installDir}).\n` +
        'Update a source checkout with git, or reinstall with the install.sh one-liner.');
  }

  const tarball = `https://github.com/${REPO_SLUG}/archive/refs/heads/${REPO_BRANCH}.tar.gz`;
  console.error(dim(`downloading ${REPO_SLUG}@${REPO_BRANCH} ...`));

  // Stage into a temp dir on the same filesystem as installDir so the swap is an
  // atomic rename, then replace in place.
  const staging = fs.mkdtempSync(path.join(path.dirname(installDir), '.claude-usage-update-'));
  try {
    const dl = spawnSync('bash', ['-c', `curl -fsSL "${tarball}" | tar -xz -C "${staging}" --strip-components=1`], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (dl.status !== 0) die(`download failed from ${tarball}`);
    if (!fs.existsSync(path.join(staging, 'cli.js'))) die('downloaded archive is missing cli.js.');

    fs.rmSync(installDir, { recursive: true, force: true });
    fs.renameSync(staging, installDir);
  } catch (e) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw e;
  }

  const newCli = path.join(installDir, 'cli.js');
  fs.chmodSync(newCli, 0o755);
  fs.mkdirSync(path.dirname(BIN_PATH), { recursive: true });
  try { fs.rmSync(BIN_PATH); } catch {}
  fs.symlinkSync(newCli, BIN_PATH);
  console.error(green('✓ ') + dim('updated CLI at ') + installDir);

  // Rebuild the widget only if it was already installed.
  if (process.platform === 'darwin' && fs.existsSync(WIDGET_APP)) {
    console.error(dim('rebuilding macOS widget ...'));
    const build = spawnSync('bash', [path.join(installDir, 'macos', 'build.sh')], {
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_USAGE_NODE: process.execPath, CLAUDE_USAGE_CLI: newCli },
    });
    if (build.status !== 0) die('widget rebuild failed (see output above).');
    console.error(green('✓ ') + dim('rebuilt widget'));
  }

  console.error(green('✓ up to date.'));
}
