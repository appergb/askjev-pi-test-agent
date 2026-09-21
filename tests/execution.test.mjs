import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { executeTest } from '../src/execution.mjs';

async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-execution-'));
  const workspace = path.join(root, 'workspace'); await fs.mkdir(workspace);
  try { await fn(root, workspace); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
const prefix = "import test from 'node:test';import assert from 'node:assert/strict';\n";
test('sandbox executes assertions and distinguishes assertion failures from syntax errors', { skip: process.platform !== 'darwin' }, async () => fixture(async (_root, workspace) => {
  await fs.writeFile(path.join(workspace, 'pass.test.mjs'), prefix + "test('pass',()=>assert.equal(1,1));");
  await fs.writeFile(path.join(workspace, 'fail.test.mjs'), prefix + "test('fail',()=>assert.equal(1,2));");
  await fs.writeFile(path.join(workspace, 'syntax.test.mjs'), 'this is not valid JS {{{');
  assert.equal((await executeTest(workspace, 'pass.test.mjs')).classification, 'passed');
  assert.equal((await executeTest(workspace, 'fail.test.mjs')).classification, 'assertion_failure');
  assert.equal((await executeTest(workspace, 'syntax.test.mjs')).classification, 'test_error');
}));
test('sandbox blocks source writes, outside reads, symlink escapes, child processes and network', { skip: process.platform !== 'darwin' }, async () => fixture(async (root, workspace) => {
  const outside = path.join(root, 'private-marker.txt'); await fs.writeFile(outside, 'private marker');
  await fs.writeFile(path.join(workspace, 'source.mjs'), 'unchanged');
  await fs.symlink(outside, path.join(workspace, 'escape.txt'));
  let connections = 0;
  const server = http.createServer((_req, res) => { connections++; res.end('reachable'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  assert.equal(await (await fetch(endpoint)).text(), 'reachable');
  const code = prefix + `import fs from 'node:fs';import {spawnSync} from 'node:child_process';
test('write',()=>assert.throws(()=>fs.writeFileSync('source.mjs','changed')));
test('read',()=>assert.throws(()=>fs.readFileSync(${JSON.stringify(outside)})));
test('symlink',()=>assert.throws(()=>fs.readFileSync('escape.txt')));
test('spawn',()=>assert.ok(spawnSync('/usr/bin/true').error));
test('network',async()=>assert.rejects(fetch(${JSON.stringify(endpoint)},{signal:AbortSignal.timeout(1000)})));
test('environment',()=>assert.equal(process.env.PI_TEST_CANARY,undefined));`;
  await fs.writeFile(path.join(workspace, 'security.test.mjs'), code);
  process.env.PI_TEST_CANARY = 'must-not-inherit';
  try { const r = await executeTest(workspace, 'security.test.mjs'); assert.equal(r.classification, 'passed', r.stdout + r.stderr); assert.equal(r.counts.pass, 6); }
  finally { delete process.env.PI_TEST_CANARY; await new Promise((resolve) => server.close(resolve)); }
  assert.equal(connections, 1, 'only the unsandboxed control request reaches the service');
  assert.equal(await fs.readFile(path.join(workspace, 'source.mjs'), 'utf8'), 'unchanged');
}));
test('timeouts and cancellation kill the isolated process and are environment outcomes', { skip: process.platform !== 'darwin' }, async () => fixture(async (_root, workspace) => {
  await fs.writeFile(path.join(workspace, 'hang.test.mjs'), prefix + "test('hang',()=>{while(true){}});");
  const timed = await executeTest(workspace, 'hang.test.mjs', { timeout: 150 });
  assert.equal(timed.stop_reason, 'timeout'); assert.equal(timed.classification, 'environment_error');
  const controller = new AbortController(); setTimeout(() => controller.abort(), 150);
  const cancelled = await executeTest(workspace, 'hang.test.mjs', { timeout: 3000, signal: controller.signal });
  assert.equal(cancelled.stop_reason, 'cancelled');
}));
test('empty test programs cannot be reported as a passing suite', { skip: process.platform !== 'darwin' }, async () => fixture(async (_root, workspace) => {
  await fs.writeFile(path.join(workspace, 'empty.test.mjs'), '');
  assert.notEqual((await executeTest(workspace, 'empty.test.mjs')).classification, 'passed');
}));
