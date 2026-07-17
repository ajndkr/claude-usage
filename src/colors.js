// Tiny ANSI color helpers and the fatal-error exit.
//
// Color is enabled only for an interactive stdout (and disabled by NO_COLOR),
// so piped/redirected output stays clean.

export const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

export const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = (s) => c('1', s);
export const dim = (s) => c('2', s);
export const red = (s) => c('31', s);
export const green = (s) => c('32', s);
export const yellow = (s) => c('33', s);
export const cyan = (s) => c('36', s);

export function die(msg) {
  console.error(red('error: ') + msg);
  process.exit(1);
}
