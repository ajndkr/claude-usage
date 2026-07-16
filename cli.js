#!/usr/bin/env node
// claude-usage - a minimal CLI to track claude.ai / Claude Code usage limits.
//
// It calls the same private endpoint the claude.ai settings/usage page uses:
//   GET https://claude.ai/api/organizations/<org-uuid>/usage
// authenticating with your browser session cookie (sessionKey). The org UUID is
// read from the `lastActiveOrg` cookie. No API key required.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-usage');
const COOKIE_FILE = path.join(CONFIG_DIR, 'cookie');
const BASE = process.env.CLAUDE_USAGE_BASE || 'https://claude.ai';
const REFRESH_SECS = 60; // auto-refresh interval for the live widget
// Match a real browser so Cloudflare's cf_clearance cookie (tied to UA) stays valid.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

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

// ── cookie handling ─────────────────────────────────────────────────────────
function loadCookie() {
  if (process.env.CLAUDE_COOKIE) return process.env.CLAUDE_COOKIE.trim();
  try {
    return fs.readFileSync(COOKIE_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

function saveCookie(cookie) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(COOKIE_FILE, cookie.trim() + '\n', { mode: 0o600 });
}

function orgIdFromCookie(cookie) {
  // lastActiveOrg holds the org UUID (sometimes URL-encoded / wrapped).
  const m = cookie.match(/lastActiveOrg=([^;]+)/);
  const raw = m ? decodeURIComponent(m[1]) : cookie;
  const uuid = raw.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
  );
  return uuid ? uuid[0] : null;
}

// ── networking ────────────────────────────────────────────────────────────
async function fetchUsage(cookie) {
  const orgId = orgIdFromCookie(cookie);
  if (!orgId) {
    throw new Error(
      'could not find an organization UUID in your cookie.\n' +
        'Make sure you pasted the full cookie string including `lastActiveOrg`.'
    );
  }
  const url = `${BASE}/api/organizations/${orgId}/usage`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        cookie,
        'user-agent': USER_AGENT,
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9',
        referer: `${BASE}/settings/usage`,
      },
    });
  } catch (e) {
    throw new Error(`network request failed: ${e.message}`);
  }
  const body = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `authentication failed (HTTP ${res.status}).\n` +
        'Your session cookie is likely expired. Re-run: claude-usage login' +
        (res.status === 403
          ? '\n' + dim('(A 403 can also be Cloudflare - copy a fresh cookie right after loading claude.ai in your browser.)')
          : '')
    );
  }
  if (!res.ok) throw new Error(`unexpected response HTTP ${res.status}:\n${body.slice(0, 300)}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('response was not JSON (Cloudflare challenge?). Try refreshing your cookie.');
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

async function cmdLogin() {
  console.error(bold('Set up your claude.ai session cookie'));
  console.error(
    dim(
      [
        '',
        'How to get it:',
        '  1. Open https://claude.ai/settings/usage in your browser (logged in).',
        '  2. Open DevTools (Cmd+Option+I) → Network tab, then refresh.',
        '  3. Click the "usage" request → Headers → Request Headers.',
        '  4. Copy the entire value of the "Cookie" header.',
        '',
        'Paste it below (input hidden is not used; it will be stored at',
        `  ${COOKIE_FILE} with 0600 perms):`,
        '',
      ].join('\n')
    )
  );
  const cookie = (await prompt('Cookie: ')).trim();
  if (!cookie) die('no cookie provided.');
  if (!/sessionKey=/.test(cookie))
    console.error(yellow('warning: cookie has no `sessionKey=` - it may not authenticate.'));
  if (!orgIdFromCookie(cookie))
    console.error(yellow('warning: could not find an org UUID (`lastActiveOrg`) in the cookie.'));
  saveCookie(cookie);
  console.error(green('✓ saved. Run `claude-usage` to see your usage.'));
}

function requireCookie() {
  const cookie = loadCookie();
  if (!cookie) die('no cookie found. Run `claude-usage login` first (or set $CLAUDE_COOKIE).');
  return cookie;
}

// One-shot: fetch once and print (for scripting, pipes, cron, --json).
async function cmdOnce(jsonOut) {
  const cookie = requireCookie();
  let data;
  try {
    data = await fetchUsage(cookie);
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
  const cookie = requireCookie();
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
      state.data = await fetchUsage(cookie);
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
      '  claude-usage login      Save your claude.ai session cookie',
      '  claude-usage help       Show this help',
      '',
      'Auth: reads $CLAUDE_COOKIE, or the cookie saved by `login` at',
      '  ' + COOKIE_FILE,
    ].join('\n')
  );
}

export { orgIdFromCookie, bar, fmtReset, render };

// ── main ──────────────────────────────────────────────────────────────────
if (process.env.CLAUDE_USAGE_NO_MAIN) {
  // imported for testing; skip CLI dispatch
} else {
await (async () => {
const arg = process.argv[2];
switch (arg) {
  case 'login':
    await cmdLogin();
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
