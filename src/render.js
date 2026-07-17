// Rendering: usage bars, reset countdowns, and the full snapshot layout.
// Pure-ish (writes to stdout via console.log); bar/fmtReset are unit-tested.

import { bold, dim, red, green, yellow, cyan } from './colors.js';

export function bar(pct, width = 28) {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * width);
  const fillChar = '█'.repeat(filled);
  const emptyChar = '░'.repeat(width - filled);
  const paint = p >= 90 ? red : p >= 70 ? yellow : green;
  return paint(fillChar) + dim(emptyChar);
}

export function fmtReset(iso) {
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

export const WINDOW_LABELS = {
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

export function render(data) {
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
