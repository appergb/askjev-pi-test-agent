import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createSession, startSession, inspectSession, clearSession, stopSession, restartSession, listSessions, sessionLogs, sessionDirectory } from '../src/sessions.mjs';

async function until(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const result = await fn(); if (result) return result; await delay(80); }
  throw new Error('Timed out waiting for session state');
}

test('independent workers persist context, reject overlap, clear, cancel and restart without losing evidence', { skip: process.platform !== 'darwin', timeout: 60000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-sessions-'));
  const oldHome = process.env.ASKJEV_HOME; process.env.ASKJEV_HOME = path.join(root, 'home');
  const project = path.join(root, 'project'); await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'math.mjs'), 'export const add=(a,b)=>a+b;');
  await fs.writeFile(path.join(project, 'requirements.md'), 'add(2,3) must return 5.');
  const observations = []; let slowRequests = 0;
  const ops = [
    ['readProject', {}],
    ['askJEV', { summary: 'Addition', items: [{ case_id: 'sum', scenario: 'add 2 and 3', expected: '5', requirement_ref: 'add(2,3) must return 5.', source_ref: 'math.mjs', baseline: true }] }],
    ['writeTests', { tests: [{ case_id: 'sum', code: "import test from 'node:test';import assert from 'node:assert/strict';import {add} from '../math.mjs';test('sum',()=>assert.equal(add(2,3),5));" }] }],
    ['runTests', {}], ['finishReport', { analyses: [], limitations: ['Mock model fixture.'] }],
  ];
  const server = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    const input = JSON.parse(text);
    if (input.model === 'slow') { slowRequests++; return; }
    const lastUser = input.messages.findLastIndex((m) => m.role === 'user');
    const index = input.messages.slice(lastUser).filter((m) => m.role === 'tool').length;
    if (index === 0) observations.push({ prior_users: input.messages.slice(0, lastUser).filter((m) => m.role === 'user').length });
    await delay(70);
    const op = ops[index];
    const delta = op ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${index}`, type: 'function', function: { name: op[0], arguments: JSON.stringify(op[1]) } }] } : { role: 'assistant', content: 'Done' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [d, finish] of [[delta, null], [{}, op ? 'tool_calls' : 'stop']]) res.write('data: ' + JSON.stringify({ id: 'mock', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta: d, finish_reason: finish }] }) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const definition = { id: 'fixture', name: 'Fixture', api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } };
  const config = path.join(root, 'config.json');
  await fs.writeFile(config, JSON.stringify({ models: { fixture: { definition }, slow: { definition: { ...definition, id: 'slow' } } }, scoring: { baseUrl: 'http://127.0.0.1:1', mode: 'mock', response: { results: [{ id: 'sum', choice: 'supported', probabilities: { supported: 1, violated: 0, unknown: 0 } }] } } }));
  const request = path.join(root, 'task.json');
  await fs.writeFile(request, JSON.stringify({ schema_version: '1.0', project, files: ['math.mjs', 'requirements.md'], requirement_file: 'requirements.md', objective: 'Check sum', model: 'fixture', budget: { max_duration_seconds: 20, max_cases: 1, max_model_turns: 10, max_test_attempts: 1 } }));
  const sessions = [];
  const settled = (id) => until(async () => { const s = await inspectSession(id); return !s.busy && !['starting', 'running'].includes(s.status) ? s : false; });
  try {
    const a = await createSession('first'), b = await createSession('second'); sessions.push(a.id, b.id);
    await Promise.all([startSession(a.id, { request, config }), startSession(b.id, { request, config })]);
    assert.equal((await listSessions()).filter((s) => s.busy).length, 2);
    await assert.rejects(startSession(a.id, { request, config }));
    await assert.rejects(clearSession(a.id), /Stop the active/);
    const [doneA, doneB] = await Promise.all([settled(a.id), settled(b.id)]);
    assert.equal(doneA.status, 'completed', JSON.stringify(doneA)); assert.equal(doneB.status, 'completed');
    assert.notEqual(doneA.last_result, doneB.last_result);
    assert.deepEqual(observations.slice(0, 2).map((x) => x.prior_users), [0, 0]);
    assert.equal(doneA.context_present, true);
    await startSession(a.id, { request, config }); const continued = await settled(a.id);
    const manifest = JSON.parse(await fs.readFile(path.join(path.dirname(continued.last_result), 'manifest.json')));
    assert.equal(manifest.conversation.resumed, true); assert.ok(observations.at(-1).prior_users > 0);
    const cleared = await clearSession(a.id); assert.equal(cleared.generation, 2);
    assert.equal((await inspectSession(a.id)).context_present, false);
    assert.ok((await fs.stat(doneA.last_result)).isFile());
    await startSession(a.id, { request, config }); await settled(a.id);
    assert.equal(observations.at(-1).prior_users, 0);
    const c = await createSession('cancel'); sessions.push(c.id);
    await startSession(c.id, { request, config, model: 'slow' });
    await until(() => slowRequests > 0);
    assert.equal((await stopSession(c.id)).cancellation_requested, true);
    assert.equal((await settled(c.id)).status, 'cancelled');
    await restartSession(c.id, { request, config, model: 'fixture' });
    const restarted = await settled(c.id); assert.equal(restarted.generation, 2); assert.equal(restarted.status, 'completed');
    assert.ok((await sessionLogs(a.id)).events.length > 0);
    const other = path.join(root, 'other'); await fs.mkdir(other);
    const wrong = JSON.parse(await fs.readFile(request)); wrong.project = other;
    const wrongRequest = path.join(root, 'wrong.json'); await fs.writeFile(wrongRequest, JSON.stringify(wrong));
    await assert.rejects(startSession(a.id, { request: wrongRequest, config }), /another project/);
    assert.throws(() => sessionDirectory('../outside'));
  } finally {
    for (const id of sessions) await stopSession(id).catch(() => {});
    for (const id of sessions) await settled(id).catch(() => {});
    server.closeAllConnections(); await new Promise((r) => server.close(r));
    if (oldHome === undefined) delete process.env.ASKJEV_HOME; else process.env.ASKJEV_HOME = oldHome;
    await fs.rm(root, { recursive: true, force: true });
  }
});
