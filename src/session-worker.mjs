import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { sessionDirectory, atomicJSON } from './sessions.mjs';
import { readJSON } from './common.mjs';
import { loadConfig } from './model.mjs';
import { runCampaign } from './campaign.mjs';
import { runTask } from './runner.mjs';

// Detached worker process for one session job (spawned by sessions.mjs).
// Ownership is proven twice — the job token in job.json and the worker PID in
// busy/owner.json — before any state is touched. Cancellation arrives only
// via cancel.json polling; this process never receives business credentials
// beyond the config path it is told to load.

// Private-by-default file modes for every state file this process writes.
process.umask(0o077);
const [id, token] = process.argv.slice(2);
const dir = sessionDirectory(id);
const controller = new AbortController();
const cancel = () => controller.abort();
process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
let timer, state;
try {
  const job = await readJSON(path.join(dir, 'job.json'));
  if (job.token !== token) throw new Error('Stale job');
  state = await readJSON(path.join(dir, 'state.json'));
  if (state.job !== token) throw new Error('Stale session');
  let owner;
  for (let i = 0; i < 100; i++) {
    owner = await readJSON(path.join(dir, 'busy/owner.json'));
    if (owner.worker_pid === process.pid) break;
    await delay(20);
  }
  if (owner.worker_pid !== process.pid || owner.token !== token) throw new Error('Worker ownership not established');
  await atomicJSON(path.join(dir, 'state.json'), { ...state, status: 'running' });
  const poll = async () => { const requested = await readJSON(path.join(dir, 'cancel.json')).catch(() => null); if (requested?.job === token) cancel(); };
  await poll();
  timer = setInterval(() => { void poll(); }, 200);
  const config = await loadConfig(job.config);
  const runOptions = { signal: controller.signal, outputRoot: path.join(dir, 'runs'),
    progress: (message) => { const stage = message.match(/\] ([a-z_]+)/)?.[1] || 'progress'; void fs.appendFile(path.join(dir, 'progress.jsonl'), JSON.stringify({ job: token, at: new Date().toISOString(), stage }) + '\n', { mode: 0o600 }).catch(() => {}); },
  };
  const result = job.campaign ? await runCampaign(job.task, config, { ...runOptions, ...job.campaign }) : await runTask(job.task, config, { ...runOptions, conversation: { directory: path.join(dir, 'context'), generation: job.generation, session_id: id } });
  await atomicJSON(path.join(dir, 'state.json'), { ...state, status: result.run_status, finished_at: new Date().toISOString(), last_result: result.artifacts.result, assessment: result.assessment, statistics: result.statistics });
} catch {
  // Deliberate bare catch: the error may carry provider text, paths or
  // credential-adjacent detail that must never reach persisted session
  // state — the failure is recorded as a coded status plus a fixed hint.
  if (state?.job === token) await atomicJSON(path.join(dir, 'state.json'), { ...state, status: controller.signal.aborted ? 'cancelled' : 'failed', error_code: 'SESSION_RUN_FAILED', hint: 'Check configuration and session evidence; clear interrupted context before retrying.' });
} finally {
  clearInterval(timer);
  // Only the owner releases busy/ — a stale worker can never delete a live job's guard.
  const owner = await readJSON(path.join(dir, 'busy/owner.json')).catch(() => null);
  if (owner?.token === token) await fs.rm(path.join(dir, 'busy'), { recursive: true, force: true });
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
