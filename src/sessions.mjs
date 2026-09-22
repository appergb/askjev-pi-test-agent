import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { appHome, configPath } from './paths.mjs';
import { ROOT, check, readJSON, json, validateTask } from './common.mjs';

function busyError(message) { const e = new Error(message); e.code = 'SESSION_BUSY'; return e; }
const root = () => path.join(appHome(), 'sessions');
export function sessionDirectory(id) {
  check(/^s-[a-f0-9]{16}$/.test(id), 'Invalid session ID');
  return path.join(root(), id);
}
export async function atomicJSON(file, value) {
  const next = `${file}.${crypto.randomUUID()}.next`;
  await fs.writeFile(next, json(value), { mode: 0o600 });
  await fs.rename(next, file);
}
async function existing(id) {
  const dir = sessionDirectory(id);
  check(!(await fs.lstat(dir)).isSymbolicLink(), 'Session directory cannot be a symlink');
  return dir;
}
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
export async function createSession(name = 'test-session') {
  check(typeof name === 'string' && name.length > 0 && name.length <= 80 && !/[\r\n]/.test(name), 'Invalid session name');
  const id = `s-${crypto.randomBytes(8).toString('hex')}`;
  const dir = sessionDirectory(id);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const state = { schema_version: '1.0', id, name, status: 'idle', generation: 1, created_at: new Date().toISOString(), project: null, job: null, last_result: null };
  await atomicJSON(path.join(dir, 'state.json'), state);
  return state;
}
export async function inspectSession(id) {
  const dir = await existing(id);
  const state = await readJSON(path.join(dir, 'state.json'));
  const busy = await readJSON(path.join(dir, 'busy/owner.json')).catch(() => null);
  const owner = busy && (busy.worker_pid || busy.launcher_pid);
  // Only probe existence; never signal a PID that may have been recycled.
  const orphaned = busy && !alive(owner);
  const pointer = await readJSON(path.join(dir, 'context/current.json')).catch(() => null);
  const contextPresent = pointer && typeof pointer.file === 'string' && path.basename(pointer.file) === pointer.file ? await fs.access(path.join(dir, 'context', pointer.file)).then(() => true, () => false) : false;
  return { ...state, ...(orphaned ? { status: 'interrupted', recovery: 'Use session clear before a new run.' } : {}), busy: Boolean(busy && !orphaned), context_present: Boolean(contextPresent), runs_directory: path.join(dir, 'runs') };
}
export async function listSessions() {
  const names = await fs.readdir(root()).catch((e) => { if (e.code === 'ENOENT') return []; throw e; });
  return Promise.all(names.filter((s) => /^s-[a-f0-9]{16}$/.test(s)).sort().map(inspectSession));
}
async function mutation(id, fn) {
  const dir = await existing(id);
  const lock = path.join(dir, 'mutation.lock');
  try { await fs.mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw busyError('Another lifecycle operation is in progress'); throw e; }
  try { return await fn(dir); } finally { await fs.rmdir(lock); }
}
export async function startSession(id, { request, config, model, selection } = {}) {
  const resolvedConfig = await configPath(config);
  await fs.access(resolvedConfig);
  const task = validateTask(await readJSON(path.resolve(request)));
  task.project = await fs.realpath(path.resolve(task.project));
  if (model) task.model = model;
  if (selection) task.selection = selection;
  validateTask(task);
  return mutation(id, async (dir) => {
    const state = await readJSON(path.join(dir, 'state.json'));
    check(!state.project || state.project === task.project, 'Session is bound to another project; create another session');
    try { await fs.mkdir(path.join(dir, 'busy')); } catch (e) { if (e.code === 'EEXIST') throw busyError('Session already has an active or interrupted job; inspect it'); throw e; }
    const token = crypto.randomUUID();
    let child;
    try {
      const job = { token, task, config: resolvedConfig, generation: state.generation, created_at: new Date().toISOString() };
      await atomicJSON(path.join(dir, 'job.json'), job);
      await atomicJSON(path.join(dir, 'busy/owner.json'), { token, launcher_pid: process.pid });
      await fs.rm(path.join(dir, 'cancel.json'), { force: true });
      await atomicJSON(path.join(dir, 'state.json'), { ...state, status: 'starting', project: task.project, job: token, started_at: job.created_at, last_result: null, assessment: null, statistics: null, error_code: null });
      child = spawn(process.execPath, [path.join(ROOT, 'src/session-worker.mjs'), id, token], { detached: true, stdio: 'ignore', env: process.env });
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
      // The worker replaces this with its own identity; both refer to the same child.
      await atomicJSON(path.join(dir, 'busy/owner.json'), { token, launcher_pid: process.pid, worker_pid: child.pid });
      child.unref();
      return { id, job: token, status: 'starting', generation: state.generation, next: 'session inspect / session logs / session stop' };
    } catch (e) {
      if (!child?.pid) { await fs.rm(path.join(dir, 'busy'), { recursive: true, force: true }); await atomicJSON(path.join(dir, 'state.json'), { ...state, status: 'failed' }); }
      throw e;
    }
  });
}
export async function stopSession(id) {
  return mutation(id, async (dir) => {
    const state = await inspectSession(id);
    if (state.busy) await atomicJSON(path.join(dir, 'cancel.json'), { job: state.job });
    return { id, status: state.busy ? 'cancelling' : state.status, cancellation_requested: state.busy };
  });
}
export async function clearSession(id) {
  return mutation(id, async (dir) => {
    const inspected = await inspectSession(id);
    if (inspected.busy) throw busyError('Stop the active run before clearing context');
    const state = await readJSON(path.join(dir, 'state.json'));
    await fs.rm(path.join(dir, 'context'), { recursive: true, force: true });
    await fs.rm(path.join(dir, 'busy'), { recursive: true, force: true });
    await fs.rm(path.join(dir, 'cancel.json'), { force: true });
    const updated = { ...state, generation: state.generation + 1, status: 'idle', job: null, cleared_at: new Date().toISOString() };
    await atomicJSON(path.join(dir, 'state.json'), updated);
    return { ...updated, evidence_retained: true };
  });
}
export async function restartSession(id, options = {}) {
  const dir = await existing(id);
  // Resolve the previous submitted task, not model text or an arbitrary shell command.
  const previous = await readJSON(path.join(dir, 'job.json')).catch(() => null);
  check(options.request || previous, 'Restart requires a previous job or --request');
  await stopSession(id);
  for (let i = 0; i < 50 && (await inspectSession(id)).busy; i++) await delay(200);
  if ((await inspectSession(id)).busy) throw busyError('Cancellation is still pending; inspect before retrying restart');
  await clearSession(id);
  if (!options.request) {
    const file = path.join(dir, 'restart-task.json');
    await atomicJSON(file, previous.task);
    return startSession(id, { ...options, request: file, config: options.config || previous.config });
  }
  return startSession(id, options);
}
export async function sessionLogs(id) {
  const dir = await existing(id);
  const state = await inspectSession(id);
  const file = path.join(dir, 'progress.jsonl');
  const handle = await fs.open(file, 'r').catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
  if (!handle) return { id, status: state.status, events: [] };
  try {
    const stat = await handle.stat(); const start = Math.max(0, stat.size - 16000); const buffer = Buffer.alloc(stat.size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const lines = buffer.toString('utf8').split('\n'); if (start) lines.shift();
    return { id, status: state.status, events: lines.filter(Boolean).slice(-100).map((line) => JSON.parse(line)) };
  } finally { await handle.close(); }
}
