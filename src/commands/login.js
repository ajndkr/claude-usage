// Browser OAuth login - the default, same experience as Claude Code.
//
// Loopback flow: spin up a localhost server, open the authorize URL, capture the
// redirect. Manual flow (--manual): print the URL, paste back the `code#state`.

import http from 'node:http';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { OAUTH_MANUAL_REDIRECT } from '../config.js';
import { pkce, b64url, buildAuthUrl, exchangeCode } from '../oauth.js';
import { saveAuth } from '../auth.js';
import { bold, dim, green, cyan, die } from '../colors.js';

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

export async function cmdLogin({ manual = false } = {}) {
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
