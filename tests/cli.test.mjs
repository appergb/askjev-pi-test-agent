import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, VERSION } from '../src/common.mjs';
import { doctor, probeModel } from '../src/application.mjs';

const exec = promisify(execFile);
async function cli(args, root, executable = path.join(ROOT, 'src/cli.mjs')) {
  try {
    const r = await exec(process.execPath, [executable, ...args], { cwd: root, env: { ...process.env, ASKJEV_HOME: path.join(root, 'home'), ASKJEV_CONFIG: '', PI_TEST_CONFIG: '' } });
    return { ...r, code: 0 };
  } catch (e) { return { stdout: e.stdout, stderr: e.stderr, code: e.code }; }
}

test('standalone CLI works via npm-style symlink outside checkout and refuses overwrite', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-cli-'));
  try {
    const bin = path.join(root, 'askjev'); await fs.symlink(path.join(ROOT, 'src/cli.mjs'), bin);
    assert.equal((await cli(['--version'], root, bin)).stdout.trim(), `askJEV Agent ${VERSION}`);
    const result = await cli(['init'], root, bin);
    assert.equal(result.code, 0, result.stdout);
    const file = path.join(root, 'home/config.json');
    const before = await fs.readFile(file, 'utf8');
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.equal((await cli(['init'], root, bin)).code, 2);
    assert.equal(await fs.readFile(file, 'utf8'), before);
    const models = JSON.parse((await cli(['models'], root, bin)).stdout);
    assert.deepEqual(models.models, [{ alias: 'flash-direct' }]);
    assert.equal(JSON.stringify(models).includes('model-provider.example'), false);
    assert.equal((await cli(['bogus'], root, bin)).code, 2);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('import keeps credential references private and resolves them against the config file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-import-'));
  try {
    const source = path.join(root, 'old.json');
    const config = { models: { cloud: { auth_file: 'auth.json', auth_provider: 'secret-provider' } }, scoring: { baseUrl: 'http://127.0.0.1:1234', apiKey: 'fixture-secret-never-output' } };
    await fs.writeFile(source, JSON.stringify(config));
    const result = await cli(['init', '--import-config', source], root);
    assert.equal(result.code, 0);
    assert.ok(!result.stdout.includes('fixture-secret'));
    const saved = JSON.parse(await fs.readFile(path.join(root, 'home/config.json')));
    assert.equal(saved.models.cloud.auth_file, path.join(root, 'auth.json'));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('example task is usable from another directory and never replaces existing projects', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-example-'));
  try {
    const directory = path.join(root, 'example');
    assert.equal((await cli(['example', '--directory', directory], root)).code, 0);
    const task = JSON.parse(await fs.readFile(path.join(directory, 'task.json')));
    assert.equal(task.project, directory);
    for (const file of task.files) assert.ok((await fs.stat(path.join(task.project, file))).isFile());
    assert.equal((await cli(['example', '--directory', directory], root)).code, 2);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('model probe verifies an actual tool call and never echoes provider text', async () => {
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    assert.equal(JSON.parse(body).tools[0].function.name, 'connectionProbe');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason) => 'data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason }] }) + '\n\n';
    res.write(chunk({ role: 'assistant', tool_calls: [{ index: 0, id: 'probe', type: 'function', function: { name: 'connectionProbe', arguments: '{"ok":true}' } }] }, null));
    res.write(chunk({}, 'tool_calls')); res.end('data: [DONE]\n\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const config = { models: { fixture: { definition: { id: 'fixture', name: 'fixture', api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } } } };
  try {
    assert.equal((await probeModel(config, 'fixture')).tool_call_verified, true);
    const missing = await probeModel(config, 'missing');
    assert.equal(missing.ok, false); assert.equal(missing.error_code, 'MODEL_CONNECTION_FAILED');
  } finally { await new Promise((r) => server.close(r)); }
});

test('doctor reports scoring and sandbox separately and does not leak endpoint credentials', async () => {
  const result = await doctor({ models: {}, scoring: { baseUrl: 'file:///fixture-private-credential' } });
  assert.equal(result.ok, false);
  assert.equal(result.checks.find((c) => c.component === 'scoring').ok, false);
  assert.equal(result.checks.find((c) => c.component === 'sandbox').ok, process.platform === 'darwin');
  assert.ok(!JSON.stringify(result).includes('fixture-private-credential'));
});
