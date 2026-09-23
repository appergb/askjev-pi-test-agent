import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { ROOT, VERSION } from '../src/common.mjs';
import { TerminalAgent } from '../src/terminal-agent.mjs';
import { parseInput, runTerminal } from '../src/terminal.mjs';

const exec = promisify(execFile);
const waitFor = async (condition) => {
  const deadline = Date.now() + 5000;
  while (!condition()) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for terminal state');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test('installed terminal entry supports help/version via symlink and rejects model flags and non-TTY startup', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-terminal-cli-'));
  try {
    const entry = path.join(root, 'askjev-cli');
    await fs.symlink(path.join(ROOT, 'src/terminal.mjs'), entry);
    const invoke = (args) => exec(process.execPath, [entry, ...args], { cwd: root });
    assert.equal((await invoke(['--version'])).stdout.trim(), `askJEV ${VERSION}`);
    assert.match((await invoke(['--help'])).stdout, /\/run/);
    await assert.rejects(invoke([]), (error) => error.code === 2 && error.stderr.includes('交互终端'));
    await assert.rejects(invoke(['--model', 'other']), (error) => error.code === 2);
    assert.deepEqual(parseInput('/run "a path/task.json"'), { command: 'run', argument: 'a path/task.json' });
    assert.deepEqual(parseInput('/run a path/task.json'), { command: 'run', argument: 'a path/task.json' });
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

class FakeTerminal {
  columns = 80;
  rows = 30;
  kittyProtocolActive = false;
  output = '';
  start(input, resize) { this.input = input; this.resize = resize; }
  stop() { this.stopped = true; }
  write(data) { this.output += data; }
  moveBy() {}
  hideCursor() {}
  showCursor() {}
  clearLine() {}
  clearFromCursor() {}
  clearScreen() {}
  setTitle(title) { this.title = title; }
  setProgress() {}
  async drainInput() {}
  get text() { return stripTerminalSequences(this.output); }
  send(text) { for (const char of text) this.input(char); }
}

test('terminal displays askJEV, blocks model commands, streams replies, cancels work and restores terminal', async () => {
  const terminal = new FakeTerminal();
  let prompts = 0, cancelled = false, clears = 0, taskPath;
  const agent = {
    cwd: ROOT,
    async prompt(text, signal) {
      prompts++;
      this.onEvent({ type: 'message_start', message: { role: 'assistant' } });
      this.onEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '来自测试会话的回答。' } });
      await new Promise((resolve) => signal.addEventListener('abort', () => { cancelled = true; resolve(); }, { once: true }));
    },
    async run(request) {
      taskPath = request;
      this.onEvent({ type: 'result', result: { run_status: 'partial', assessment: 'inconclusive', statistics: { executed_cases: 1, passed_cases: 1 }, artifacts: { report: '/tmp/report.md' } } });
    },
    async clear() { clears++; },
  };
  const running = runTerminal({ agent, terminal, registerSignals: false });
  try {
    await waitFor(() => terminal.input && terminal.text.includes('askJEV'));
    assert.equal(terminal.title, 'askJEV');
    assert.ok(!terminal.text.includes('mvp/') && !terminal.text.includes('select model'));
    terminal.send('/model\r');
    await waitFor(() => terminal.text.includes('不提供选择或切换'));
    terminal.input('\x10'); // Pi's model-cycle shortcut has no model action here.
    assert.equal(prompts, 0);
    terminal.send('你好\r');
    await waitFor(() => prompts === 1 && terminal.text.includes('来自测试会话的回答'));
    terminal.input('\x03');
    await waitFor(() => cancelled);
    await new Promise((resolve) => setTimeout(resolve, 20));
    terminal.send('/run "a path/task.json"\r');
    await waitFor(() => taskPath && terminal.text.includes('未完成'));
    assert.equal(taskPath, 'a path/task.json');
    assert.ok(terminal.text.includes('尚无完整结论'));
    terminal.columns = 28;
    terminal.resize();
    await new Promise((resolve) => setTimeout(resolve, 20));
    terminal.send('/exit\r');
    await running;
    assert.equal(terminal.stopped, true);
    assert.equal(clears, 1);
  } finally {
    if (!terminal.stopped && terminal.input) { terminal.send('/exit\r'); await running; }
  }
});

test('interactive conversation calls real test pipeline and forces configured model over task model', { skip: process.platform !== 'darwin', timeout: 30000 }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-terminal-agent-'));
  const oldHome = process.env.ASKJEV_HOME;
  process.env.ASKJEV_HOME = path.join(root, 'home');
  const requests = [], events = [];
  let chatCalls = 0, testCalls = 0;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    requests.push(input);
    const isChat = input.tools.some((tool) => tool.function.name === 'runTestTask');
    const operations = [
      ['readProject', {}],
      ['askJEV', { summary: 'Verify addition', items: [{ case_id: 'sum', scenario: 'add(2,3)', expected: '5', requirement_ref: 'add(2,3) must return 5.', source_ref: 'math.mjs', baseline: true }] }],
      ['writeTests', { tests: [{ case_id: 'sum', code: "import test from 'node:test';import assert from 'node:assert/strict';import {add} from '../math.mjs';test('sum',()=>assert.equal(add(2,3),5));" }] }],
      ['runTests', {}],
      ['finishReport', { analyses: [], limitations: ['Local fixture only.'] }],
    ];
    const operation = isChat ? (chatCalls++ === 0 ? ['runTestTask', { request: 'task.json' }] : undefined) : operations[testCalls++];
    const delta = operation ? { role: 'assistant', tool_calls: [{ index: 0, id: `call_${requests.length}`, type: 'function', function: { name: operation[0], arguments: JSON.stringify(operation[1]) } }] } : { role: 'assistant', content: '测试完成。' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish_reason) => 'data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixed-fixture', choices: [{ index: 0, delta, finish_reason }] }) + '\n\n';
    res.write(chunk(delta, null)); res.write(chunk({}, operation ? 'tool_calls' : 'stop')); res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let agent;
  try {
    await fs.writeFile(path.join(root, 'math.mjs'), 'export const add=(a,b)=>a+b;');
    await fs.writeFile(path.join(root, 'requirements.md'), 'add(2,3) must return 5.');
    const task = { schema_version: '1.0', project: '.', files: ['math.mjs', 'requirements.md'], requirement_file: 'requirements.md', objective: 'Check addition', model: 'must-not-be-used', budget: { max_duration_seconds: 15, max_cases: 1, max_model_turns: 10, max_test_attempts: 1 } };
    await fs.writeFile(path.join(root, 'task.json'), JSON.stringify(task));
    const config = {
      default_model: 'fixed', models: { fixed: { definition: { id: 'fixed-fixture', name: 'Private model name', api: 'openai-completions', baseUrl: `http://127.0.0.1:${server.address().port}/v1`, reasoning: false, input: ['text'], contextWindow: 32000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' } } } },
      scoring: { baseUrl: 'http://127.0.0.1:1', mode: 'mock', response: { results: [{ id: 'sum', choice: 'supported', probabilities: { supported: 0.9, violated: 0.05, unknown: 0.05 } }] } },
    };
    const configFile = path.join(root, 'config.json'); await fs.writeFile(configFile, JSON.stringify(config));
    agent = new TerminalAgent({ cwd: root, configFile, outputRoot: path.join(root, 'runs'), onEvent: (event) => events.push(event) });
    await agent.prompt('请执行 task.json');
    assert.equal(agent.lastResult?.run_status, 'completed', JSON.stringify(agent.lastResult));
    assert.equal(agent.lastResult.statistics.passed_cases, 1);
    assert.ok(requests.length >= 7);
    assert.ok(requests.every((input) => input.model === 'fixed-fixture'));
    assert.ok(requests[0].tools.every((tool) => !['bash', 'read', 'write', 'edit'].includes(tool.function.name)));
    assert.ok(!JSON.stringify(agent.lastResult).includes('Private model name'));
    assert.ok(events.some((event) => event.type === 'progress'));
    assert.ok(events.some((event) => event.type === 'message_update'));
    const reportFile = agent.lastResult.artifacts.report;
    await agent.clear();
    assert.ok((await fs.stat(reportFile)).isFile());
    assert.deepEqual(await fs.readdir(path.join(root, 'home/terminal')), []);
    assert.equal((await agent.report()).statistics.passed_cases, 1);
  } finally {
    await agent?.clear();
    await new Promise((resolve) => server.close(resolve));
    if (oldHome === undefined) delete process.env.ASKJEV_HOME; else process.env.ASKJEV_HOME = oldHome;
    await fs.rm(root, { recursive: true, force: true });
  }
});
