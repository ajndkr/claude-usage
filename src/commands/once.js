// One-shot: fetch once and print (for scripting, pipes, cron, --json).

import { requireAuth } from '../auth.js';
import { fetchUsage } from '../usage.js';
import { render } from '../render.js';
import { die } from '../colors.js';

export async function cmdOnce(jsonOut) {
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
