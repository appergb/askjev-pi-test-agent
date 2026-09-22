import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { sessionDirectory, atomicJSON } from './sessions.mjs';
import { readJSON } from './common.mjs';
import { loadConfig } from './model.mjs';
import { runTask } from './runner.mjs';

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
  const result = await runTask(job.task, config, { signal: controller.signal, outputRoot: path.join(dir, 'runs'), conversation: { directory: path.join(dir, 'context'), generation: job.generation, session_id: id },
    progress: (message) => { const stage = message.match(/\] ([a-z_]+)/)?.[1] || 'progress'; void fs.appendFile(path.join(dir, 'progress.jsonl'), JSON.stringify({ job: token, at: new Date().toISOString(), stage }) + '\n', { mode: 0o600 }).catch(() => {}); },
  });
  await atomicJSON(path.join(dir, 'state.json'), { ...state, status: result.run_status, finished_at: new Date().toISOString(), last_result: result.artifacts.result, assessment: result.assessment, statistics: result.statistics });
} catch {
  if (state?.job === token) await atomicJSON(path.join(dir, 'state.json'), { ...state, status: controller.signal.aborted ? 'cancelled' : 'failed', error_code: 'SESSION_RUN_FAILED', hint: 'Check configuration and session evidence; clear interrupted context before retrying.' });
} finally {
  clearInterval(timer);
  const owner = await readJSON(path.join(dir, 'busy/owner.json')).catch(() => null);
  if (owner?.token === token) await fs.rm(path.join(dir, 'busy'), { recursive: true, force: true });
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
}
