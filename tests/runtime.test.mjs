import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { runTask, regress, attachEvidence } from '../src/runner.mjs';
import { exitCode } from '../src/cli.mjs';

test('Pi SDK workflow, Mock labeling, findings and unchanged regression work together', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-runtime-'));
  const project = path.join(root, 'project'); await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'math.mjs'), 'export const add=(a,b)=>a-b;');
  await fs.writeFile(path.join(project, 'requirements.md'), 'add(2,3) must return 5.');
  let call = 0;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const data of req) body += data;
    const input = JSON.parse(body);
    const index = call++;
    const operations = [
      ['readProject', {}],
      ['askJEV', { summary: 'Check the required sum', items: [{ case_id: 'sum', scenario: 'add(2,3)', expected: '5', requirement_ref: 'add(2,3) must return 5.', source_ref: 'math.mjs', baseline: true }] }],
      ['writeTests', { tests: [{ case_id: 'sum', code: "import test from 'node:test';import assert from 'node:assert/strict';import {add} from '../math.mjs';test('sum',()=>assert.equal(add(2,3),5));" }] }],
      ['runTests', {}],
    ];
    if (index === 4) {
      const result = JSON.parse(input.messages.findLast((m) => m.role === 'tool').content);
      const evidence = result.results[0].stdout.match(/Expected values[\s\S]*?operator: 'strictEqual'/)[0];
      operations.push(['finishReport', { analyses: [{ case_id: 'sum', category: 'confirmed_product_defect', title: 'Incorrect sum', expected: '5', actual: '-1', evidence_excerpt: evidence }], limitations: ['Mock provider integration fixture only.'] }]);
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const operation = operations[index];
    const delta = operation ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${index}`, type: 'function', function: { name: operation[0], arguments: JSON.stringify(operation[1]) } }] } : { role: 'assistant', content: 'Done.' };
    res.write('data: ' + JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', model: 'mock-agent', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n');
    res.write('data: ' + JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', model: 'mock-agent', choices: [{ index: 0, delta: {}, finish_reason: operation ? 'tool_calls' : 'stop' }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { models: { fixture: { definition: { id: 'mock-agent', name: 'Fixture', api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } } }, scoring: { mode: 'mock', response: { results: [{ id: 'sum', choice: 'violated', probabilities: { supported: 0.1, violated: 0.8, unknown: 0.1 } }] } } };
    const task = { schema_version: '1.0', project, files: ['math.mjs', 'requirements.md'], requirement_file: 'requirements.md', objective: 'Test addition', model: 'fixture', budget: { max_duration_seconds: 20, max_cases: 1, max_model_turns: 10, max_test_attempts: 1 } };
    const result = await runTask(task, config, { outputRoot: path.join(root, 'runs'), progress: () => {} });
    assert.equal(result.run_status, 'completed', JSON.stringify(result)); assert.equal(result.assessment, 'confirmed_findings'); assert.equal(exitCode(result), 1);
    assert.equal(result.findings.length, 1);
    assert.equal(result.statistics.executed_tests, 1);
    assert.equal(JSON.parse(await fs.readFile(path.join(result.artifacts.directory, 'scores.json'))).backend_mode, 'mock');
    await fs.writeFile(path.join(project, 'math.mjs'), 'export const add=(a,b)=>a+b;');
    const regression = await regress(result.artifacts.directory, project, { outputRoot: path.join(root, 'runs') });
    assert.equal(regression.statistics.passed_cases, 1); assert.equal(regression.tests_unchanged, true); assert.notEqual(regression.snapshot_id, result.snapshot_id); assert.equal(regression.scores_reused, false);
    const originalTest = path.join(result.artifacts.directory, 'workspace/tests/sum.test.mjs');
    await fs.chmod(originalTest, 0o600);
    await fs.writeFile(originalTest, '// changed');
    await assert.rejects(regress(result.artifacts.directory, project, { outputRoot: path.join(root, 'runs') }), /modified/);
  } finally { await new Promise((resolve) => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); }
});

test('exit codes preserve incomplete and cancelled outcomes', () => {
  assert.equal(exitCode({ run_status: 'partial', assessment: 'confirmed_findings' }), 4);
  assert.equal(exitCode({ run_status: 'cancelled' }), 5);
  assert.equal(exitCode({ run_status: 'failed' }), 3);
  assert.equal(exitCode({ run_status: 'completed', assessment: 'inconclusive' }), 4);
});

test('invented or reformatted evidence is replaced by actual executor output', () => {
  const execution = { stdout: "not ok 1\n  error: 'actual failure'\n  code: 'ERR_ASSERTION'\n", stderr: '' };
  const normalized = attachEvidence({ case_id: 'a', evidence_excerpt: 'Invented failure that never occurred' }, execution);
  assert.equal(normalized.evidence_source, 'executor');
  assert.ok(execution.stdout.includes(normalized.evidence_excerpt));
  assert.ok(!normalized.evidence_excerpt.includes('Invented'));
});
