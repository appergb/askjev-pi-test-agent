#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { VERSION } from './common.mjs';

export const COMMANDS = [
  { name: 'help', description: '查看使用说明' },
  { name: 'run', description: '执行任务：/run <task.json>' },
  { name: 'report', description: '查看结果：/report [运行目录]' },
  { name: 'doctor', description: '检查测试环境与评分连接' },
  { name: 'clear', description: '开始新对话，保留测试证据' },
  { name: 'cancel', description: '停止当前任务' },
  { name: 'exit', description: '退出 askJEV' },
];

const HELP = `askJEV ${VERSION} — 交互式测试终端

用法：askjev-cli [--project <目录>] [--config <私密配置文件>]

直接输入需求与 task.json 路径进行对话，或使用：
${COMMANDS.map(({ name, description }) => `  /${name.padEnd(8)} ${description}`).join('\n')}

Enter 发送 · Shift+Enter 换行 · Esc / Ctrl+C 停止任务 · Ctrl+D 退出
模型由应用配置固定。此入口不提供模型菜单、切换快捷键或 --model 参数。
配置和测试证据沿用 askjev；脚本与后台会话请继续使用 askjev。
`;

export function parseInput(text) {
  const input = text.trim();
  if (!input.startsWith('/')) return { command: 'chat', argument: input };
  const [, command, tail = ''] = input.match(/^\/(\S+)(?:\s+([\s\S]*))?$/) || [];
  const argument = tail.trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
  return { command, argument };
}

export async function runTerminal({ agent, terminal: providedTerminal, registerSignals = true }) {
  const { Container, Editor, Markdown, Text, Spacer, Loader, ProcessTerminal, TuiMainScreen, CombinedAutocompleteProvider, matchesKey, stripTerminalSequences, truncateToWidth, visibleWidth } = await import('@earendil-works/pi-tui');
  const clean = (text) => stripTerminalSequences(String(text)).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
  const color = (code) => (text) => `\x1b[${code}m${text}\x1b[0m`;
  const accent = color('38;5;79'), muted = color('38;5;244'), bold = color('1');
  const selectList = { selectedPrefix: accent, selectedText: accent, description: muted, scrollInfo: muted, noMatch: muted };
  const markdownTheme = { heading: bold, link: accent, linkUrl: muted, code: accent, codeBlock: (s) => s, codeBlockBorder: muted, quote: muted, quoteBorder: muted, hr: muted, listBullet: accent, bold, italic: color('3'), strikethrough: color('9'), underline: color('4') };
  const terminal = providedTerminal || new ProcessTerminal();
  const tui = new TuiMainScreen(terminal, true);
  const transcript = new Container();
  const status = new Container();
  const editor = new Editor(tui, { borderColor: accent, selectList }, { paddingX: 1 });
  editor.setAutocompleteProvider(new CombinedAutocompleteProvider(COMMANDS, agent.cwd));
  let busy = false, closing = false, activeController, activeWork, assistantBlock, assistantText = '', loader;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const displayPath = agent.cwd.startsWith(os.homedir() + path.sep) ? '~' + agent.cwd.slice(os.homedir().length) : agent.cwd;
  tui.addChild({ invalidate() {}, render(width) {
    const lines = width >= 48 ? ['', accent('  █▀█ █▀ █▄▀ ░░█ █▀▀ █░█'), accent('  █▀█ ▄█ █░█ █▄█ ██▄ ▀▄▀')] : [''];
    lines.push(`  ${bold('askJEV')}  ${muted(`v${VERSION} · 代码测试与缺陷检查`)}`, '', muted(`  ${clean(displayPath)}`), '');
    return lines.map((line) => truncateToWidth(line, width));
  } });
  tui.addChild(transcript);
  tui.addChild(status);
  tui.addChild(editor);
  tui.addChild({ invalidate() {}, render(width) {
    const left = ' Enter 发送 · /help 帮助';
    const right = busy ? 'Esc 停止 ' : '就绪 ';
    if (visibleWidth(left + right) + 2 > width) return [truncateToWidth(muted(right), width)];
    return [muted(left + ' '.repeat(width - visibleWidth(left + right)) + right)];
  } });
  const say = (text, title = 'askJEV') => {
    transcript.addChild(new Text(title === '你' ? muted('  你') : accent(`  ${title}`), 0, 0));
    const block = new Markdown(clean(text), 2, 0, markdownTheme);
    transcript.addChild(block);
    transcript.addChild(new Spacer(1));
    tui.requestRender();
    return block;
  };
  const showResult = (result) => {
    const states = { completed: '已完成', partial: '未完成', failed: '执行失败', cancelled: '已取消' };
    const stats = result.statistics || {};
    const assessment = { confirmed_findings: '发现缺陷', no_confirmed_findings: '本轮未发现确认缺陷', inconclusive: '尚无完整结论' };
    const lines = [`**${states[result.run_status] || '未完成'} · ${assessment[result.assessment] || '请查看证据'}**`, '', `执行 ${stats.executed_cases ?? 0} 项 · 通过 ${stats.passed_cases ?? 0} 项 · 失败 ${stats.failed_cases ?? 0} 项 · 未选测 ${stats.skipped ?? 0} 项`];
    if (result.artifacts?.report) lines.push('', `报告：${result.artifacts.report}`);
    for (const finding of result.findings || []) lines.push('', `- ${finding.title}`);
    say(lines.join('\n'));
  };
  agent.onEvent = (event) => {
    if (closing) return;
    if (event.type === 'message_start' && event.message.role === 'assistant') { assistantBlock = undefined; assistantText = ''; }
    if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') {
      assistantText += event.assistantMessageEvent.delta;
      assistantBlock ??= say('');
      assistantBlock.setText(clean(assistantText));
    }
    if (event.type === 'message_end' && event.message.role === 'assistant' && event.message.stopReason === 'error') say('对话请求未完成。请检查私密配置和生成服务连接后重试。', '提示');
    if (event.type === 'progress') {
      const stage = event.message.replace(/^\[[^\]]+\]\s*/, '').split(':')[0];
      const labels = { preparing: '准备任务', baseline: '执行原测试基线', reading: '读取批准文件', scoring: '评估候选检查项', planning: '制定测试计划', generating: '生成测试', executing: '执行测试', completed: '整理测试报告', failed: '保存失败证据', partial: '保存已完成的证据', cancelled: '保存取消前的证据', tool_error: '处理测试异常' };
      loader?.setMessage(labels[stage] || '测试进行中…');
    }
    if (event.type === 'tool_execution_start') loader?.setMessage('正在处理测试任务…');
    if (event.type === 'result') showResult(event.result);
    tui.requestRender();
  };
  const cancel = () => { activeController?.abort(); loader?.setMessage('正在停止并保存证据…'); tui.requestRender(); };
  const close = () => { if (closing) return; closing = true; cancel(); resolveClosed(); };
  const execute = async (input) => {
    const { command, argument } = parseInput(input);
    if (command === 'exit') { close(); return; }
    if (command === 'cancel') { if (busy) cancel(); else say('当前没有正在执行的任务。'); return; }
    if (command === 'help') { say(HELP); return; }
    if (['model', 'models', 'settings', 'login', 'logout'].includes(command)) { say('模型由应用配置固定，此界面不提供选择或切换。'); return; }
    if (busy) { editor.setText(input); say('当前任务正在进行。可按 Esc 停止，或等待完成后发送下一条。', '提示'); return; }
    if (command !== 'chat' && !COMMANDS.some((entry) => entry.name === command)) { say('未知命令。输入 /help 查看可用命令。', '提示'); return; }
    if (command === 'run' && !argument) { say('用法：/run <task.json>。路径包含空格时可加引号。', '提示'); return; }
    if (['clear', 'doctor'].includes(command) && argument) { say(`/${command} 不接受参数。`, '提示'); return; }
    if (!input.trim()) return;
    busy = true;
    activeController = new AbortController();
    editor.addToHistory(input);
    say(input, '你');
    loader = new Loader(tui, accent, muted, command === 'chat' ? '正在思考…' : '正在处理…');
    status.addChild(loader);
    try {
      if (command === 'clear') { await agent.clear(); transcript.clear(); say('已开始新对话，测试证据仍保留。'); }
      else if (command === 'run') await agent.run(argument, activeController.signal);
      else if (command === 'report') await agent.report(argument);
      else if (command === 'doctor') {
        const result = await agent.diagnose(activeController.signal);
        say(`**${result.ok ? '测试环境检查通过' : '部分检查未通过'}**\n\n${result.checks.map((item) => `- ${item.component}：${item.ok ? '可用' : '未通过'}`).join('\n')}`);
      } else await agent.prompt(argument, activeController.signal);
    } catch {
      if (!closing) say(activeController.signal.aborted ? '任务已停止。已产生的测试证据保留在运行目录。' : '操作未完成。请核对任务路径和私密配置；可使用 /doctor 检查环境，或在终端运行 askjev init 初始化配置。', '提示');
    } finally {
      loader?.stop(); loader = undefined; status.clear(); busy = false; activeController = undefined;
      if (!closing) tui.requestRender();
    }
  };
  editor.onSubmit = (input) => {
    editor.setText('');
    const work = execute(input);
    if (busy && !activeWork) { activeWork = work; void work.finally(() => { activeWork = undefined; }); }
  };
  tui.addInputListener((data) => {
    if (matchesKey(data, 'ctrl+c')) {
      if (busy) cancel(); else if (editor.getText()) editor.setText(''); else close();
      return { consume: true };
    }
    if (matchesKey(data, 'ctrl+d') && !editor.getText()) { close(); return { consume: true }; }
    if (matchesKey(data, 'escape') && busy) { cancel(); return { consume: true }; }
    return undefined;
  });
  const interrupt = () => { if (busy) cancel(); else close(); };
  const signalHandlers = { SIGINT: interrupt, SIGTERM: close, SIGHUP: close };
  if (registerSignals) for (const [name, handler] of Object.entries(signalHandlers)) process.on(name, handler);
  try {
    say('告诉我你要检查什么，并提供 task.json 路径。也可以输入 **/run task.json** 直接开始测试。');
    tui.setFocus(editor);
    tui.start();
    terminal.setTitle('askJEV');
    await closed;
    await activeWork;
  } finally {
    loader?.stop();
    tui.stop();
    if (registerSignals) for (const [name, handler] of Object.entries(signalHandlers)) process.removeListener(name, handler);
    await agent.clear();
  }
}

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { project: { type: 'string' }, config: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } } });
  if (values.help) { process.stdout.write(HELP); return; }
  if (values.version) { process.stdout.write(`askJEV ${VERSION}\n`); return; }
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('TTY_REQUIRED');
  const cwd = path.resolve(values.project || process.cwd());
  if (!(await fs.stat(cwd)).isDirectory()) throw new Error('INVALID_PROJECT');
  const { TerminalAgent } = await import('./terminal-agent.mjs');
  await runTerminal({ agent: new TerminalAgent({ cwd, configFile: values.config ? path.resolve(values.config) : undefined }) });
}

if (process.argv[1] && await fs.realpath(process.argv[1]).catch(() => '') === import.meta.filename) main().catch((error) => {
  const message = error.message === 'TTY_REQUIRED' ? '请在交互终端中运行 askjev-cli。脚本调用请使用 askjev；帮助：askjev-cli --help。' : '无法启动 askJEV。请检查目录和参数；帮助：askjev-cli --help。';
  process.stderr.write(message + '\n');
  process.exitCode = 2;
});
