// Auth storage: load/save the OAuth tokens, plus the require-auth guard.
//
// Precedence: $CLAUDE_CODE_OAUTH_TOKEN → auth.json. Tokens are stored at
// ~/.config/claude-usage/auth.json with 0600 perms.

import fs from 'node:fs';
import { CONFIG_DIR, AUTH_FILE } from './config.js';
import { die } from './colors.js';

// Returns { accessToken, refreshToken, expiresAt } or null.
export function loadAuth() {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { accessToken: process.env.CLAUDE_CODE_OAUTH_TOKEN.trim(), refreshToken: null, expiresAt: null };
  }
  try {
    const j = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    if (j && j.accessToken) {
      return { accessToken: j.accessToken, refreshToken: j.refreshToken || null, expiresAt: j.expiresAt || null };
    }
  } catch {}
  return null;
}

export function saveAuth(auth) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const data = { accessToken: auth.accessToken, refreshToken: auth.refreshToken, expiresAt: auth.expiresAt };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

// Load auth or exit with a helpful message. Used by the read-only commands.
export function requireAuth() {
  const auth = loadAuth();
  if (!auth) die('not logged in. Run `claude-usage login` (or set $CLAUDE_CODE_OAUTH_TOKEN).');
  return auth;
}
