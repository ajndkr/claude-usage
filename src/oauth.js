// OAuth 2.0 + PKCE against claude.ai, matching Claude Code's public client.
//
// pkce/buildAuthUrl/normalizeTokens are pure and unit-tested. exchangeCode and
// refreshOAuth talk to the token endpoint. refreshOAuth mutates the passed auth
// object in place and persists it, so the watch loop keeps using fresh tokens.

import crypto from 'node:crypto';
import {
  OAUTH_CLIENT_ID,
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  OAUTH_SCOPES,
  CLAUDE_CODE_UA,
} from './config.js';
import { saveAuth } from './auth.js';

export const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrl({ challenge, state, redirectUri, manual }) {
  const p = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: OAUTH_SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  });
  // `code=true` asks the authorize page to display the code for copy/paste.
  if (manual) p.set('code', 'true');
  return `${OAUTH_AUTHORIZE_URL}?${p.toString()}`;
}

export function normalizeTokens(j) {
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || null,
    expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null,
  };
}

export async function exchangeCode({ code, verifier, state, redirectUri }) {
  let res;
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': CLAUDE_CODE_UA },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        state,
        client_id: OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
  } catch (e) {
    throw new Error(`token exchange request failed: ${e.message}`);
  }
  const body = await res.text();
  if (!res.ok) throw new Error(`token exchange failed (HTTP ${res.status}):\n${body.slice(0, 300)}`);
  try {
    return normalizeTokens(JSON.parse(body));
  } catch {
    throw new Error('token exchange returned a non-JSON response.');
  }
}

// Refresh in place and persist. Mutates `auth`. Throws if it can't refresh.
export async function refreshOAuth(auth) {
  if (!auth.refreshToken) {
    throw new Error('session expired. Run `claude-usage login` to sign in again.');
  }
  let res;
  try {
    res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': CLAUDE_CODE_UA },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        client_id: OAUTH_CLIENT_ID,
      }),
    });
  } catch (e) {
    throw new Error(`token refresh request failed: ${e.message}`);
  }
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`token refresh failed (HTTP ${res.status}). Run \`claude-usage login\` to sign in again.`);
  }
  let t;
  try {
    t = normalizeTokens(JSON.parse(body));
  } catch {
    throw new Error('token refresh returned a non-JSON response.');
  }
  auth.accessToken = t.accessToken;
  auth.refreshToken = t.refreshToken || auth.refreshToken; // some servers omit a new refresh token
  auth.expiresAt = t.expiresAt;
  saveAuth(auth);
}
