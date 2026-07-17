// Live terminal widget: render, auto-refresh every REFRESH_SECS, `r` to refresh
// now, `q`/Ctrl-C to quit. Keeps the last good reading on transient errors.

import { REFRESH_SECS } from '../config.js';
import { requireAuth } from '../auth.js';
import { fetchUsage } from '../usage.js';
import { render } from '../render.js';
import { bold, dim, red, cyan } from '../colors.js';

const timeStr = (d) => d.toLocaleTimeString(undefined, { hour12: false });

export async function cmdWatch() {
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
      if (key === 'q' || key === '' || key === '') cleanup();
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
