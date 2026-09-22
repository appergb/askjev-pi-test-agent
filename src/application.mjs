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
