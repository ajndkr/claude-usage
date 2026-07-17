// Networking: fetch the usage snapshot from the OAuth usage endpoint.
//
// Throws on error (never calls die) so the watch loop can survive transient
// failures and keep the last good reading. One-shot callers catch and die.
// Refreshes proactively (within 60s of expiry) and reactively (once on 401/403).

import { API_BASE, CLAUDE_CODE_UA, OAUTH_BETA } from './config.js';
import { refreshOAuth } from './oauth.js';

export async function fetchUsage(auth) {
  // Proactively refresh when we know the token is about to expire.
  if (auth.refreshToken && auth.expiresAt && Date.now() >= auth.expiresAt - 60_000) {
    await refreshOAuth(auth);
  }
  const doReq = async () => {
    try {
      return await fetch(`${API_BASE}/api/oauth/usage`, {
        headers: {
          authorization: `Bearer ${auth.accessToken}`,
          'anthropic-beta': OAUTH_BETA,
          'user-agent': CLAUDE_CODE_UA,
          accept: 'application/json',
        },
      });
    } catch (e) {
      throw new Error(`network request failed: ${e.message}`);
    }
  };
  let res = await doReq();
  // Reactively refresh once on an auth failure, then retry.
  if ((res.status === 401 || res.status === 403) && auth.refreshToken) {
    await refreshOAuth(auth);
    res = await doReq();
  }
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `authentication failed (HTTP ${res.status}).\n` +
        'Your session has expired. Re-run: claude-usage login'
    );
  }
  if (res.status === 429) {
    throw new Error('rate limited (HTTP 429) by the usage endpoint. Wait a moment and try again.');
  }
  if (!res.ok) throw new Error(`unexpected response HTTP ${res.status}:\n${body.slice(0, 300)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('usage response was not JSON.');
  }
}
