#!/usr/bin/env node
// claude-usage - a minimal CLI to track claude.ai / Claude Code usage limits.
//
// Auth is a browser OAuth login, identical to how Claude Code signs in with a
// claude.ai subscription (Pro/Max) account: an OAuth 2.0 + PKCE flow against
// https://claude.ai/oauth/authorize. The resulting access token reads usage from
// GET https://api.anthropic.com/api/oauth/usage. No API key, no cookie.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-usage');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json'); // OAuth tokens
const API_BASE = process.env.CLAUDE_USAGE_API_BASE || 'https://api.anthropic.com';
const REFRESH_SECS = 60; // auto-refresh interval for the live widget

// OAuth config - matches Claude Code's public client so a claude.ai subscription
// (Pro/Max) login works without any API key.
const OAUTH_CLIENT_ID = process.env.CLAUDE_USAGE_CLIENT_ID || '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const OAUTH_AUTHORIZE_URL = process.env.CLAUDE_USAGE_AUTHORIZE_URL || 'https://claude.ai/oauth/authorize';
const OAUTH_TOKEN_URL = process.env.CLAUDE_USAGE_TOKEN_URL || 'https://console.anthropic.com/v1/oauth/token';
// user:profile is required by /api/oauth/usage; user:inference matches Claude Code.
const OAUTH_SCOPES = 'user:profile user:inference';
// Redirect used by the manual (copy/paste) fallback flow.
const OAUTH_MANUAL_REDIRECT = 'https://console.anthropic.com/oauth/code/callback';

// The usage endpoint aggressively rate-limits unknown clients; a claude-code/*
// User-Agent lands in the normal bucket. anthropic-beta gates the OAuth surface.
const CLAUDE_CODE_UA = 'claude-code/1.0.60 (external, cli)';
const OAUTH_BETA = 'oauth-2025-04-20';

// ── tiny ansi helpers ──────────────────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => c('1', s);
const dim = (s) => c('2', s);
const red = (s) => c('31', s);
const green = (s) => c('32', s);
const yellow = (s) => c('33', s);
const cyan = (s) => c('36', s);

function die(msg) {
  console.error(red('error: ') + msg);
  process.exit(1);
}

// ── auth storage ────────────────────────────────────────────────────────────
// Returns { accessToken, refreshToken, expiresAt } or null.
function loadAuth() {
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

function saveAuth(auth) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const data = { accessToken: auth.accessToken, refreshToken: auth.refreshToken, expiresAt: auth.expiresAt };
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

// ── OAuth (PKCE) ─────────────────────────────────────────────────────────────
const b64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function buildAuthUrl({ challenge, state, redirectUri, manual }) {
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

function normalizeTokens(j) {
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token || null,
    expiresAt: j.expires_in ? Date.now() + j.expires_in * 1000 : null,
  };
}

async function exchangeCode({ code, verifier, state, redirectUri }) {
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
async function refreshOAuth(auth) {
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

// ── networking ────────────────────────────────────────────────────────────
// Throws on error (never calls die) so the watch loop can survive transient
// failures and keep the last good reading. One-shot callers catch and die.
async function fetchUsage(auth) {
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

// ── rendering ────────────────────────────────────────────────────────────
function bar(pct, width = 28) {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * width);
  const fillChar = '█'.repeat(filled);
  const emptyChar = '░'.repeat(width - filled);
  const paint = p >= 90 ? red : p >= 70 ? yellow : green;
  return paint(fillChar) + dim(emptyChar);
}

function fmtReset(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then)) return '';
  const ms = then - new Date();
  if (ms <= 0) return dim('(resetting)');
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const rel = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return dim(`resets in ${rel}`);
}

const WINDOW_LABELS = {
  five_hour: 'Session (5h)',
  seven_day: 'Weekly (7d)',
  seven_day_opus: 'Weekly · Opus',
  seven_day_sonnet: 'Weekly · Sonnet',
};

function renderWindow(label, w) {
  if (!w || typeof w.utilization !== 'number') return;
  const pct = w.utilization;
  const pctStr = `${pct.toFixed(0)}%`.padStart(4);
  const paint = pct >= 90 ? red : pct >= 70 ? yellow : green;
  console.log(
    `  ${label.padEnd(16)} ${bar(pct)} ${paint(pctStr)}  ${fmtReset(w.resets_at)}`
  );
}

function render(data) {
  console.log('\n' + bold(cyan('  Claude usage')));
  console.log(dim('  ' + '─'.repeat(60)));
  let shown = 0;
  for (const [key, label] of Object.entries(WINDOW_LABELS)) {
    if (data[key]) {
      renderWindow(label, data[key]);
      shown++;
    }
  }
  if (!shown) {
    console.log(dim('  No usage windows reported. Raw response:'));
    console.log(JSON.stringify(data, null, 2));
  }
  const extra = data.extra_usage;
  if (extra && typeof extra === 'object') {
    const used = extra.used_credits ?? extra.used ?? extra.amount_used;
    if (used != null) console.log(dim(`\n  Extra usage: ${used}`));
  }
  console.log('');
}

// ── commands ────────────────────────────────────────────────────────────
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(a))));
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
function resultPage(title, message) {
  return `<!doctype html><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#1a1a1a;color:#eee;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.card{text-align:center;max-width:32rem;padding:2rem}h1{font-size:1.4rem}p{color:#aaa}</style>
<div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div>`;
}

// Spin up a loopback server, resolve with the auth code once claude.ai redirects
// back to it. Mirrors Claude Code's localhost callback.
function startCallbackServer(expectedState) {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode, rejectCode;
    const codePromise = new Promise((res, rej) => { resolveCode = res; rejectCode = rej; });
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname !== '/callback') {
        res.writeHead(404); res.end('Not found'); return;
      }
      const code = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      const error = u.searchParams.get('error');
      const fail = (msg) => {
        res.writeHead(400, { 'content-type': 'text/html' });
        res.end(resultPage('Login failed', msg));
        rejectCode(new Error(msg));
      };
      if (error) return fail(`authorization failed: ${error}`);
      if (!code) return fail('no authorization code was returned.');
      if (state !== expectedState) return fail('state mismatch - possible CSRF, aborting.');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(resultPage('✓ Logged in', 'You can close this tab and return to your terminal.'));
      resolveCode(code);
    });
    server.on('error', rejectServer);
    server.listen(0, '127.0.0.1', () => {
      resolveServer({ server, port: server.address().port, codePromise });
    });
  });
}

// Browser OAuth login - the default, same experience as Claude Code.
async function cmdLogin({ manual = false } = {}) {
  const { verifier, challenge } = pkce();
  const state = b64url(crypto.randomBytes(32));

  if (manual) {
    const authUrl = buildAuthUrl({ challenge, state, redirectUri: OAUTH_MANUAL_REDIRECT, manual: true });
    console.error(bold('Log in to claude.ai (manual mode)'));
    console.error(dim('\nOpen this URL in a browser signed in to your Claude account:\n'));
    console.error('  ' + cyan(authUrl) + '\n');
    console.error(dim('After approving, copy the code shown and paste it here.'));
    const input = (await prompt('Code: ')).trim();
    if (!input) die('no code provided.');
    // The manual page returns `code#state`; split if present.
    const [code, returnedState] = input.split('#');
    const tokens = await exchangeCode({
      code,
      verifier,
      state: returnedState || state,
      redirectUri: OAUTH_MANUAL_REDIRECT,
    });
    saveAuth(tokens);
    console.error(green('✓ Logged in. Run `claude-usage` to see your usage.'));
    return;
  }

  let server, port, codePromise;
  try {
    ({ server, port, codePromise } = await startCallbackServer(state));
  } catch (e) {
    die(`could not start local login server: ${e.message}\nTry: claude-usage login --manual`);
  }
  const redirectUri = `http://localhost:${port}/callback`;
  const authUrl = buildAuthUrl({ challenge, state, redirectUri, manual: false });

  console.error(bold('Opening your browser to log in to claude.ai…'));
  const opened = openBrowser(authUrl);
  console.error(
    dim(
      '\n' +
        (opened ? "If it didn't open, visit this URL manually:" : 'Open this URL in your browser:') +
        '\n'
    )
  );
  console.error('  ' + cyan(authUrl) + '\n');
  console.error(dim('Waiting for you to approve the login…  (Ctrl-C to cancel, or use `login --manual`)'));

  let code;
  try {
    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error('timed out waiting for login (5 min).')), 300_000).unref()
    );
    code = await Promise.race([codePromise, timeout]);
  } catch (e) {
    server.close();
    die(`${e.message}\nTry: claude-usage login --manual`);
  }
  server.close();

  let tokens;
  try {
    tokens = await exchangeCode({ code, verifier, state, redirectUri });
  } catch (e) {
    die(e.message);
  }
  saveAuth(tokens);
  console.error(green('\n✓ Logged in. Run `claude-usage` to see your usage.'));
}

function requireAuth() {
  const auth = loadAuth();
  if (!auth) die('not logged in. Run `claude-usage login` (or set $CLAUDE_CODE_OAUTH_TOKEN).');
  return auth;
}

// One-shot: fetch once and print (for scripting, pipes, cron, --json).
async function cmdOnce(jsonOut) {
  const auth = requireAuth();
  let data;
  try {
    data = await fetchUsage(auth);
  } catch (e) {
    die(e.message);
  }
  if (jsonOut) console.log(JSON.stringify(data, null, 2));
  else render(data);
}

const timeStr = (d) => d.toLocaleTimeString(undefined, { hour12: false });

// Live terminal widget: render, auto-refresh every REFRESH_SECS, `r` to refresh
// now, `q`/Ctrl-C to quit. Keeps the last good reading on transient errors.
async function cmdWatch() {
  const auth = requireAuth();
  const state = { data: null, error: null, updatedAt: null, secsLeft: REFRESH_SECS, refreshing: false };
  let timer = null;

  const cleanup = () => {
    if (timer) clearInterval(timer);
    if (process.stdin.isTTY) {
      try { process.stdin.setRawMode(false); } catch {}
    }
    process.stdin.pause();
    process.stdout.write('\x1b[?25h'); // show cursor
    process.stdout.write('\n');
    process.exit(0);
  };

  const draw = () => {
    process.stdout.write('\x1b[H'); // cursor home (redraw in place, low flicker)
    if (state.data) render(state.data);
    else if (!state.error) console.log('\n' + dim('  loading…') + '\n');
    else console.log('\n' + bold(cyan('  Claude usage')) + '\n');

    if (state.error) {
      for (const line of state.error.split('\n')) console.log('  ' + red(line));
      console.log('');
    }

    const foot = state.refreshing
      ? cyan('updating…')
      : dim(`updated ${state.updatedAt ? timeStr(state.updatedAt) : '-'}`) +
        dim('  ·  ') +
        dim(`auto-refresh in ${state.secsLeft}s`);
    console.log('  ' + foot + dim('  ·  ') + dim('[r] refresh  [q] quit'));
    process.stdout.write('\x1b[0J'); // clear anything below
  };

  const refresh = async () => {
    if (state.refreshing) return;
    state.refreshing = true;
    draw();
    try {
      state.data = await fetchUsage(auth);
      state.error = null;
    } catch (e) {
      state.error = e.message;
    }
    state.updatedAt = new Date();
    state.secsLeft = REFRESH_SECS;
    state.refreshing = false;
    draw();
  };

  process.stdout.write('\x1b[2J\x1b[H\x1b[?25l'); // clear screen, home, hide cursor
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(true); } catch {}
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (key) => {
      if (key === 'q' || key === '\u0003' || key === '\u001b') cleanup();
      else if (key === 'r' || key === ' ') refresh();
    });
  }
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  draw();
  await refresh();
  timer = setInterval(() => {
    if (state.refreshing) return;
    state.secsLeft -= 1;
    if (state.secsLeft <= 0) refresh();
    else draw();
  }, 1000);
}

function usage() {
  console.log(
    [
      bold('claude-usage') + ' - track your claude.ai / Claude Code usage limits',
      '',
      'Usage:',
      '  claude-usage            Live widget - auto-refresh every 60s ([r] refresh, [q] quit)',
      '  claude-usage --once     Print usage once and exit (for scripts/cron)',
      '  claude-usage --json     Print the raw JSON response once and exit',
      '  claude-usage login      Log in via browser (claude.ai Pro/Max account)',
      '  claude-usage login --manual   Browser login without a local server (copy/paste code)',
      '  claude-usage logout     Remove saved credentials',
      '  claude-usage help       Show this help',
      '',
      'Auth: reads $CLAUDE_CODE_OAUTH_TOKEN, or the credentials saved by `login` at',
      '  ' + AUTH_FILE,
    ].join('\n')
  );
}

function cmdLogout() {
  let removed = false;
  try { fs.rmSync(AUTH_FILE); removed = true; } catch {}
  console.error(removed ? green('✓ logged out.') : dim('nothing to remove.'));
}

export { bar, fmtReset, render, pkce, buildAuthUrl, normalizeTokens };

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
