import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { runTask, regress } from '../src/runner.mjs';
import { replay } from '../src/replay.mjs';
import { validateBrowserPlan, executeBrowser } from '../src/browser.mjs';
import { recordFeedback } from '../src/handoff.mjs';
const plan = (steps) => JSON.stringify({ schema_version: '1.0', steps });

test('browser plans reject arbitrary code, URL operations and assertion-free action lists', () => {
  for (const steps of [[{ action: 'evaluate', selector: '#count', value: 'process.env' }], [{ action: 'click', selector: '#count' }], [{ action: 'text', selector: '#count', value: '0', code: 'something' }]]) assert.throws(() => validateBrowserPlan({ schema_version: '1.0', steps }));
  assert.doesNotThrow(() => validateBrowserPlan(JSON.parse(plan([{ action: 'text', selector: '#count', value: '0' }]))));
});

test('real browser executes only selected plans; frozen comparison and unchanged fixed-source regression work', { skip: process.platform !== 'darwin', timeout: 45000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-browser-'));
  const project = path.join(root, 'project'); await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'index.html'), '<button id="increment">add</button><p id="count">0</p><script src="app.js"></script>');
  await fs.writeFile(path.join(project, 'app.js'), "document.querySelector('#increment').onclick=()=>{};");
  const contract = 'After clicking increment once, the count must be 1; before any click it must be 0.';
  await fs.writeFile(path.join(project, 'requirements.md'), contract);
  let calls = 0;
  const operations = [
    ['readProject', {}],
    ['askJEV', { summary: 'Counter behavior', items: [{ case_id: 'click', scenario: 'Click increment', expected: 'count 1', requirement_ref: contract, source_ref: 'app.js', baseline: false }, { case_id: 'initial', scenario: 'Initial count', expected: 'count 0', requirement_ref: contract, source_ref: 'app.js', baseline: true }] }],
    ['writeTests', { tests: [{ case_id: 'click', code: plan([{ action: 'click', selector: '#increment' }, { action: 'text', selector: '#count', value: '1' }]) }, { case_id: 'initial', code: plan([{ action: 'text', selector: '#count', value: '0' }]) }] }],
    ['runTests', {}],
    ['finishReport', { analyses: [{ case_id: 'click', category: 'confirmed_product_defect', title: 'Counter not incremented', expected: '1', actual: '0' }], limitations: ['Mock model, real Chrome fixture.'] }],
  ];
  const server = http.createServer(async (req, res) => {
    for await (const chunk of req) { /* consume */ }
    const op = operations[calls++];
    const delta = op ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${calls}`, type: 'function', function: { name: op[0], arguments: JSON.stringify(op[1]) } }] } : { role: 'assistant', content: 'Done' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [d, finish] of [[delta, null], [{}, op ? 'tool_calls' : 'stop']]) res.write('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: d, finish_reason: finish }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const config = { models: { fixture: { definition: { id: 'fixture', name: 'Fixture', api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } } }, scoring: { mode: 'mock', response: { results: [{ id: 'click', choice: 'violated', probabilities: { supported: 0.1, violated: 0.8, unknown: 0.1 } }, { id: 'initial', choice: 'supported', probabilities: { supported: 0.9, violated: 0.05, unknown: 0.05 } }] } } };
  const task = { schema_version: '1.0', project, files: ['index.html', 'app.js', 'requirements.md'], requirement_file: 'requirements.md', objective: 'Counter test', model: 'fixture', execution: { type: 'browser', entry: 'index.html', assets: ['index.html', 'app.js'] }, selection: { mode: 'lowest', count: 1 }, budget: { max_duration_seconds: 30, max_cases: 2, min_cases: 2, max_model_turns: 10, max_test_attempts: 1 } };
  try {
    const result = await runTask(task, config, { outputRoot: root, progress: () => {} });
    assert.equal(result.run_status, 'completed', JSON.stringify(result));
    assert.equal(result.statistics.executed_cases, 1); assert.equal(result.statistics.failed_cases, 1); assert.equal(result.statistics.skipped, 1);
    const dir = result.artifacts.directory;
    assert.ok((await fs.stat(path.join(dir, 'evidence/click-1.png'))).size > 0);
    assert.ok(!await fs.access(path.join(dir, 'evidence/initial-1.json')).then(() => true, () => false));
    const high = await replay(dir, { mode: 'highest', count: 1 }, { outputRoot: root });
    assert.equal(high.statistics.passed_cases, 1); assert.deepEqual(high.selection.selected_ids, ['initial']);
    const all = await replay(dir, { mode: 'all' }, { outputRoot: root });
    assert.equal(all.statistics.executed_cases, 2); assert.equal(all.statistics.assertion_failures, 1);
    const none = await replay(dir, { mode: 'range', min: 0.3, max: 0.4 }, { outputRoot: root });
    assert.equal(none.assessment, 'inconclusive'); assert.equal(none.statistics.executed_cases, 0);
    await fs.writeFile(path.join(project, 'app.js'), "document.querySelector('#increment').onclick=()=>document.querySelector('#count').textContent='1';");
    const fixed = await regress(dir, project, { outputRoot: root });
    assert.equal(fixed.statistics.passed_cases, 2); assert.equal(fixed.tests_unchanged, true);
    assert.equal((await recordFeedback(dir, fixed.artifacts.directory)).overall_status, 'regression_passed');
    const source = path.join(dir, 'workspace/app.js'); await fs.chmod(source, 0o600); await fs.writeFile(source, '// modified');
    await assert.rejects(replay(dir, { mode: 'all' }, { outputRoot: root }), /Saved source changed/);
  } finally { await new Promise((r) => server.close(r)); await fs.rm(root, { recursive: true, force: true }); }
});

test('browser snapshot blocks external fetches and cancellation is not an assertion failure', { skip: process.platform !== 'darwin', timeout: 20000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-browser-egress-'));
  let requests = 0;
  const trap = http.createServer((req, res) => { requests++; res.end('not allowed'); });
  await new Promise((r) => trap.listen(0, '127.0.0.1', r));
  try {
    await fs.writeFile(path.join(root, 'index.html'), '<p id="status">ready</p><script src="app.js"></script>');
    await fs.writeFile(path.join(root, 'app.js'), `fetch('http://127.0.0.1:${trap.address().port}/private').catch(()=>{});`);
    await fs.writeFile(path.join(root, 'probe.json'), plan([{ action: 'text', selector: '#status', value: 'ready' }]));
    const execution = { entry: 'index.html', assets: ['index.html', 'app.js'] };
    const result = await executeBrowser(root, 'probe.json', { execution });
    assert.equal(result.classification, 'passed'); assert.equal(requests, 0);
    const cancelled = await executeBrowser(root, 'probe.json', { execution, signal: AbortSignal.abort() });
    assert.equal(cancelled.classification, 'environment_error'); assert.equal(cancelled.assertion_failure, false);
  } finally { await new Promise((r) => trap.close(r)); await fs.rm(root, { recursive: true, force: true }); }
});
