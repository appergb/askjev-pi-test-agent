import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Type } from 'typebox';
import { ROOT, check, readJSON, json } from './common.mjs';
import { modelRuntime } from './model.mjs';
import { executeBrowser } from './browser.mjs';
import { executeTest } from './execution.mjs';

const exec = promisify(execFile);
import { appHome } from './paths.mjs';

// Installation and diagnostics commands (`askjev init/example/connect/doctor`).
// All outputs are coded result objects: raw provider, SSH or filesystem error
// text never reaches the CLI surface.

/**
 * Write the private config into the app home. Uses flag 'wx' so an existing
 * config is never silently overwritten; importing re-anchors relative
 * credential/SSH paths to the imported file's directory.
 * @param {string} [file] Target config path (default <appHome>/config.json).
 * @param {string} [source] Config file to import (default bundled example).
 * @returns {Promise<object>} { config_file, imported, next }.
 * @throws {Error} When the target already exists or the source is invalid.
 */
export async function initialize(file, source) {
  const target = path.resolve(file || path.join(appHome(), 'config.json'));
  const config = await readJSON(source || path.join(ROOT, 'config/agent.example.json'));
  check(config.models && typeof config.scoring?.baseUrl === 'string', 'Invalid configuration');
  // Imported references remain valid outside the source checkout.
  if (source) {
    const base = path.dirname(path.resolve(source));
    for (const entry of Object.values(config.models)) if (entry.auth_file && !path.isAbsolute(entry.auth_file)) entry.auth_file = path.resolve(base, entry.auth_file);
    for (const key of ['control_socket', 'login_document']) if (config.ssh?.[key] && !path.isAbsolute(config.ssh[key])) config.ssh[key] = path.resolve(base, config.ssh[key]);
  }
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, json(config), { flag: 'wx', mode: 0o600 });
  return { config_file: target, imported: Boolean(source), next: 'Configure model credentials, then run askjev connect start and askjev doctor --probe.' };
}

/**
 * Copy the bundled retry-demo example into a fresh directory and rewrite its
 * task.json project path. The mkdir without 'recursive' refuses to reuse an
 * existing directory.
 * @param {string} directory Target directory for the demo project.
 * @returns {Promise<object>} { project, request, note } paths for the CLI.
 */
export async function createExample(directory) {
  check(directory, 'example requires --directory');
  const target = path.resolve(directory);
  await fs.mkdir(target, { mode: 0o700 }); // Refuse an existing directory.
  await fs.cp(path.join(ROOT, 'examples/retry-demo'), target, { recursive: true });
  const task = await readJSON(path.join(target, 'task.json'));
  task.project = target;
  await fs.writeFile(path.join(target, 'task.json'), json(task), { mode: 0o600 });
  return { project: target, request: path.join(target, 'task.json'), note: 'Demo contains intentionally seeded defects.' };
}

/**
 * Start/status/stop the SSH scoring tunnel by delegating to the bundled
 * Python script. Best effort: any failure collapses to a coded
 * SSH_CONNECTION_FAILED result with setup hints, never a thrown error.
 * @param {string} action One of 'start' | 'status' | 'stop'.
 * @param {string} file Private config file passed to the tunnel script.
 * @param {AbortSignal} [signal] Cancellation signal.
 * @returns {Promise<object>} { action, ok, already_running? } or coded failure.
 */
export async function connect(action, file, signal) {
  check(['start', 'status', 'stop'].includes(action), 'Use connect start, status or stop');
  // execFile passes arguments directly; connection identities and stderr never enter output.
  try {
    const { stdout } = await exec('python3', [path.join(ROOT, 'scripts/cloud-tunnel.py'), action, '--config', file], { timeout: 45000, maxBuffer: 16384, signal });
    const result = JSON.parse(stdout);
    return { action, ok: result.ok === true, ...(result.already_running ? { already_running: true } : {}) };
  } catch {
    return { action, ok: false, error_code: 'SSH_CONNECTION_FAILED', hint: 'Check Python 3, SSH configuration, known_hosts and local port availability.' };
  }
}

/**
 * Verify real model tool-calling: the model must invoke a probe tool with
 * ok=true within 60 s. Output is drained without logging any provider text;
 * all failures collapse to coded results.
 * @param {object} config Resolved private config.
 * @param {string} label Model alias to probe.
 * @param {AbortSignal} [signal] Cancellation signal.
 * @returns {Promise<object>} { alias, ok, tool_call_verified, duration_ms, error_code? }.
 */
export async function probeModel(config, label, signal) {
  const started = performance.now();
  const dir = await temporaryRuntime();
  try {
    const { runtime, model } = await modelRuntime(config, label, dir);
    const stream = runtime.streamSimple(model, {
      systemPrompt: 'Call connectionProbe exactly once with ok=true. No other output.',
      messages: [{ role: 'user', content: 'Verify tool calling now.', timestamp: Date.now() }],
      tools: [{ name: 'connectionProbe', description: 'Confirm tool calling.', parameters: Type.Object({ ok: Type.Boolean() }) }],
    }, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
    for await (const event of stream) { /* Drain without logging provider text. */ }
    const message = await stream.result();
    const call = message.content.find((item) => item.type === 'toolCall' && item.name === 'connectionProbe' && item.arguments?.ok === true);
    const ok = Boolean(call) && message.stopReason !== 'error';
    return { alias: label, ok, tool_call_verified: ok, duration_ms: Math.round(performance.now() - started), ...(!ok ? { error_code: 'MODEL_TOOL_CALL_FAILED' } : {}) };
  } catch {
    return { alias: label, ok: false, tool_call_verified: false, duration_ms: Math.round(performance.now() - started), error_code: 'MODEL_CONNECTION_FAILED', hint: 'Check model alias, credentials, service availability and tunnel.' };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

async function temporaryRuntime() {
  const root = path.join(appHome(), 'runtime');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  return fs.mkdtemp(path.join(root, 'probe-'));
}

/**
 * Environment self-check behind `askjev doctor`: scoring reachability (with
 * the HTTPS-or-loopback rule), sandbox execution, optional browser execution
 * and optional live model probe. Each component reports independently; the
 * top-level ok is their conjunction.
 * @param {object} config Resolved private config.
 * @param {object} [options] { probe?, model?, signal?, browser? }.
 * @returns {Promise<object>} { ok, checks[], configured_models, generation_checked }.
 */
export async function doctor(config, { probe = false, model, signal, browser = false } = {}) {
  const checks = [];
  try {
    const url = new URL(config.scoring.baseUrl);
    check(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'Unsafe scoring URL');
    const response = await fetch(new URL('status', url.href.replace(/\/$/, '') + '/'), { headers: config.scoring.apiKey ? { Authorization: `Bearer ${config.scoring.apiKey}` } : {}, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), redirect: 'error' });
    const ok = response.ok && (await response.json()).ready === true && config.scoring.mode !== 'mock';
    checks.push({ component: 'scoring', ok, ...(!ok ? { error_code: 'SCORING_NOT_READY', hint: 'Check scoring service and askjev connect status.' } : {}) });
  } catch { checks.push({ component: 'scoring', ok: false, error_code: 'SCORING_UNREACHABLE', hint: 'Run askjev connect start; verify the private scoring configuration.' }); }
  const dir = await temporaryRuntime();
  try {
    await fs.writeFile(path.join(dir, 'probe.test.mjs'), "import test from 'node:test';import assert from 'node:assert/strict';test('doctor',()=>assert.equal(1,1));\n");
    const result = await executeTest(dir, 'probe.test.mjs', { signal });
    checks.push({ component: 'sandbox', ok: result.classification === 'passed', platform: process.platform });
  } catch { checks.push({ component: 'sandbox', ok: false, error_code: 'SANDBOX_UNAVAILABLE', hint: 'Test execution currently requires macOS and sandbox-exec; DGX Spark serves inference only.' }); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
  if (browser) {
    const dir = await temporaryRuntime();
    try {
      await fs.writeFile(path.join(dir, 'index.html'), '<p id="status">ready</p>');
      await fs.writeFile(path.join(dir, 'probe.json'), json({ schema_version: '1.0', steps: [{ action: 'text', selector: '#status', value: 'ready' }] }));
      const result = await executeBrowser(dir, 'probe.json', { execution: { entry: 'index.html', assets: ['index.html'] }, signal });
      checks.push({ component: 'browser', ok: result.classification === 'passed', engine: 'Google Chrome', ...(result.classification !== 'passed' ? { hint: 'Check that Google Chrome is installed and can launch.' } : {}) });
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }
  if (probe) checks.push({ component: 'generation', ...await probeModel(config, model || config.default_model || 'flash-direct', signal) });
  return { ok: checks.every((entry) => entry.ok), checks, configured_models: Object.keys(config.models), generation_checked: probe };
}
