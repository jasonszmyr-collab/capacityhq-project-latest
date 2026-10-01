// Run as a scheduled Render Cron Job. Secrets stay in Render and Base44
// environment settings; the cron definition contains only this file path.
'use strict';

const endpoint = process.env.BASE44_AUTO_EVALUATOR_URL;
const key = process.env.AUTO_EVALUATOR_TRIGGER_SECRET;
if (!endpoint || !/^https:\/\//.test(endpoint) || !key || key.length < 32) {
  console.error('AUTO cron missing HTTPS endpoint or a strong trigger secret');
  process.exitCode = 1;
} else {
  const url = new URL(endpoint);
  if (url.hostname !== 'honor-pole-copy-07acad67.base44.app' ||
      url.pathname !== '/functions/evaluateAutoPosition' || url.search || url.hash) {
    console.error('AUTO cron endpoint does not match the expected Base44 function');
    process.exitCode = 1;
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    (async () => {
      try {
        const result = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduler_key: key,
            dry_run: process.env.AUTO_EVALUATOR_DRY_RUN !== 'false',
            ...(process.env.AUTO_EVALUATOR_DRY_RUN !== 'false'
              ? { evaluate_all: true }
              : {}),
          }),
          signal: controller.signal,
        });
        if (!result.ok) throw new Error(`AUTO evaluator HTTP ${result.status}`);
        const response = await result.json();
        if (!Array.isArray(response.results) ||
            response.results.some((entry) => entry.error)) {
          throw new Error('AUTO evaluator returned an incomplete or failed device result');
        }
        console.log(`AUTO evaluation completed for ${response.results.length} device(s), dry_run=${process.env.AUTO_EVALUATOR_DRY_RUN !== 'false'}`);
      } catch (error) {
        console.error('AUTO scheduled evaluation failed:', error.message);
        process.exitCode = 1;
      } finally {
        clearTimeout(timer);
      }
    })();
  }
}
