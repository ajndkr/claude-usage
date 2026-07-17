// Remove saved credentials.

import fs from 'node:fs';
import { AUTH_FILE } from '../config.js';
import { green, dim } from '../colors.js';

export function cmdLogout() {
  let removed = false;
  try { fs.rmSync(AUTH_FILE); removed = true; } catch {}
  console.error(removed ? green('✓ logged out.') : dim('nothing to remove.'));
}
