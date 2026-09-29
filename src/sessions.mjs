import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { campaignLimits } from './campaign.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { appHome, configPath } from './paths.mjs';
import { ROOT, check, readJSON, json, validateTask } from './common.mjs';

// Long-lived background sessions: create/inspect/start/stop/clear/restart a
// session directory under the app home, with a detached worker process per
// job. Mutual exclusion is a `busy/` directory (mkdir is atomic); lifecycle
// mutations take a `mutation.lock` directory; crash recovery detects dead
// owners. Cancellation is a cancel.json poll, never a signal to the worker.

/** Error with code SESSION_BUSY so callers can branch on it. */
function busyError(message) { const e = new Error(message); e.code = 'SESSION_BUSY'; return e; }
const root = () => path.join(appHome(), 'sessions');
/**
 * Resolve and validate a session ID to its directory. The strict ID pattern
 * doubles as path traversal protection.
 * @param {string} id Session ID (`s-` + 16 hex chars).
 * @returns {string} Absolute session directory path.
 * @throws {Error} On a malformed ID.
 */
export function sessionDirectory(id) {
  check(/^s-[a-f0-9]{16}$/.test(id), 'Invalid session ID');
  return path.join(root(), id);
}
/** Atomic write-then-rename so readers never see partial session state. */
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
// Liveness probe: signal 0 checks existence without delivering a signal.
// EPERM is treated as alive — on some platforms a foreign-owned or protected
// PID surfaces as EPERM even though the process exists. A recycled PID can
// only ever cause a false "alive", never a false interruption claim.
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
/**
 * Read the full session view: persisted state plus derived facts (busy owner,
 * orphaned/interrupted detection, context presence). Never mutates anything.
 * @param {string} id Session ID.
 * @returns {Promise<object>} State enriched with busy/recovery fields.
 */
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
// Serialize lifecycle operations with a lock directory (mkdir is atomic on
// all platforms) so stop/clear/restart can never interleave with each other.
async function mutation(id, fn) {
  const dir = await existing(id);
  const lock = path.join(dir, 'mutation.lock');
  try { await fs.mkdir(lock); } catch (e) { if (e.code === 'EEXIST') throw busyError('Another lifecycle operation is in progress'); throw e; }
  try { return await fn(dir); } finally { await fs.rmdir(lock); }
}
/**
 * Validate the task, then spawn a detached session worker for this job inside
 * the `busy/` mutual-exclusion guard. The worker proves ownership via a
 * random token in job.json before touching state; a spawn failure rolls the
 * session back to a failed state and releases busy.
 * @param {string} id Session ID.
 * @param {object} job { request, config?, model?, selection?, scoring_failure?, campaign? }.
 * @returns {Promise<object>} { id, job: token, status, generation, next }.
 * @throws {Error} SESSION_BUSY when a job is active, or on validation failure.
 */
export async function startSession(id, { request, config, model, selection, scoring_failure, campaign } = {}) {
  const resolvedConfig = await configPath(config);
  await fs.access(resolvedConfig);
  const task = validateTask(await readJSON(path.resolve(request)));
  task.project = await fs.realpath(path.resolve(task.project));
  if (model) task.model = model;
  if (selection) task.selection = selection;
  if (scoring_failure) task.scoring_failure = scoring_failure;
  if (campaign) campaign = campaignLimits(campaign);
  validateTask(task);
  return mutation(id, async (dir) => {
    const state = await readJSON(path.join(dir, 'state.json'));
    check(!state.project || state.project === task.project, 'Session is bound to another project; create another session');
    try { await fs.mkdir(path.join(dir, 'busy')); } catch (e) { if (e.code === 'EEXIST') throw busyError('Session already has an active or interrupted job; inspect it'); throw e; }
    const token = crypto.randomUUID();
    let child;
    try {
      const job = { token, task, campaign, config: resolvedConfig, generation: state.generation, created_at: new Date().toISOString() };
      await atomicJSON(path.join(dir, 'job.json'), job);
      await atomicJSON(path.join(dir, 'busy/owner.json'), { token, launcher_pid: process.pid });
      await fs.rm(path.join(dir, 'cancel.json'), { force: true });
      await atomicJSON(path.join(dir, 'state.json'), { ...state, status: 'starting', job_kind: campaign ? 'campaign' : 'run', project: task.project, job: token, started_at: job.created_at, last_result: null, assessment: null, statistics: null, error_code: null });
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
/**
 * Request cooperative cancellation of the active job by writing cancel.json,
 * which the worker polls every 200 ms. Returns immediately; it does not wait.
 * @param {string} id Session ID.
 * @returns {Promise<object>} { id, status, cancellation_requested }.
 */
export async function stopSession(id) {
  return mutation(id, async (dir) => {
    const state = await inspectSession(id);
    if (state.busy) await atomicJSON(path.join(dir, 'cancel.json'), { job: state.job });
    return { id, status: state.busy ? 'cancelling' : state.status, cancellation_requested: state.busy };
  });
}
/**
 * Clear conversation context and job markers, bumping the generation so a
 * stale worker can never resume. Run evidence directories are retained.
 * @param {string} id Session ID.
 * @returns {Promise<object>} Updated state with evidence_retained: true.
 * @throws {Error} SESSION_BUSY while a job is active.
 */
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
/**
 * Stop, wait for cancellation to land, clear, then start again — reusing the
 * previously submitted task when no new --request is given.
 * @param {string} id Session ID.
 * @param {object} [options] Same as startSession; request optional.
 * @returns {Promise<object>} startSession result for the new job.
 * @throws {Error} If cancellation is still pending after the wait window.
 */
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
    return startSession(id, { ...options, request: file, config: options.config || previous.config, campaign: options.campaign ?? previous.campaign });
  }
  return startSession(id, options);
}
/**
 * Return the tail of progress.jsonl (last ~16 KB, parsed, at most 100 events)
 * without loading the whole file into memory.
 * @param {string} id Session ID.
 * @returns {Promise<object>} { id, status, events } (empty when no log yet).
 */
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
