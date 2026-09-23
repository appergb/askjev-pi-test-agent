#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './model.mjs';
import { createSession, listSessions, inspectSession, startSession, stopSession, clearSession, restartSession, sessionLogs } from './sessions.mjs';
import { runCampaign } from './campaign.mjs';
import { replay } from './replay.mjs';
import { runTask, regress } from './runner.mjs';
import { VERSION, check, readJSON } from './common.mjs';
import { recordFeedback } from './handoff.mjs';
import { configPath, runsHome } from './paths.mjs';
import { initialize, createExample, connect, doctor, probeModel } from './application.mjs';

export function exitCode(result) {
  if (result.run_status === 'cancelled') return 5;
  if (result.run_status === 'partial') return 4;
  if (result.run_status !== 'completed') return 3;
  if (result.assessment === 'inconclusive') return 4;
  return result.assessment === 'confirmed_findings' ? 1 : 0;
}

const HELP = `askJEV Agent ${VERSION} — 优化过的 Agent 框架

用法：askjev <command> [options]
交互终端：askjev-cli                            askJEV 对话界面，模型由应用固定
  init [--config <file>] [--import-config <file>]  初始化私密配置；不覆盖已有文件
  example --directory <new-directory>            创建可运行的缺陷 demo
  connect <start|status|stop> [--config <file>]   管理 DGX Spark / 云节点 SSH 隧道
  models [--probe --model <alias>]               查看模型别名；probe 实际验证工具调用
  doctor [--browser] [--probe --model <alias>]               检查评分、执行环境及可选生成模型
  run --request <task.json> [--model <alias>]     执行测试任务
  campaign --request <task.json> --rounds 3 --max-seconds 600  多轮自动测试与失败复现
  replay --from <run-dir> --select <mode>        冻结同一批源码、评分与测试，比较选测策略
  handoff --from <run-directory>                 读取 coding agent 缺陷交接
  regress --from <run-directory> --project <dir>  用原测试验证修复
  feedback --from <run-dir> --regression <dir>    记录回归反馈

会话：session create --name NAME [--count N] | list | inspect --id ID | logs --id ID
      session run --id ID --request TASK | campaign --id ID --request TASK --rounds 3
      session stop --id ID | clear --id ID | restart --id ID
选测：--select all | lowest --count N | highest --count N | range --min-score 0 --max-score 0.5
评分故障：--scoring-failure strict | all（all 降级仅配合全量选择）
通用选项：--config <file>、--output <runs-directory>、--help、--version
配置：--config > ASKJEV_CONFIG > PI_TEST_CONFIG > ASKJEV_HOME/config.json > 旧开发配置
默认 ASKJEV_HOME：~/.askjev-agent；运行产物：ASKJEV_HOME/runs
业务命令 stdout 为 JSON，进度写 stderr。probe 会发起一次真实模型请求。
退出码：0 成功，1 发现缺陷，2 输入或配置无效，3 执行失败，4 未完成，5 已取消。
本地测试执行支持 macOS；DGX Spark 承载远程推理与评分。
`;
const output = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const complete = (value) => ({ schema_version: '1.0', application: 'askJEV Agent', version: VERSION, run_status: value.ok === false ? 'failed' : 'completed', assessment: value.ok === false ? 'inconclusive' : 'no_confirmed_findings', ...value });

async function main() {
  const options = Object.fromEntries(['config', 'request', 'model', 'from', 'regression', 'project', 'output', 'directory', 'import-config', 'select', 'count', 'min-score', 'max-score', 'id', 'name', 'rounds', 'max-seconds', 'max-model-turns', 'scoring-failure'].map((key) => [key, { type: 'string' }]));
  Object.assign(options, { help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, probe: { type: 'boolean' }, browser: { type: 'boolean' } });
  const { values, positionals } = parseArgs({ options, allowPositionals: true });
  if (values.version) { process.stdout.write(`askJEV Agent ${VERSION}\n`); return; }
  if (values.help || !positionals.length) { process.stdout.write(HELP); return; }
  const command = positionals[0];
  check(['init', 'example', 'connect', 'models', 'doctor', 'run', 'handoff', 'regress', 'feedback', 'replay', 'session', 'campaign'].includes(command), 'Unknown command');
  check(positionals.length <= (['connect', 'session'].includes(command) ? 2 : 1), 'Unexpected argument');
  if (command === 'session') {
    const action = positionals[1] || 'list';
    let value;
    if (action === 'create') {
      const count = values.count === undefined ? 1 : Number(values.count);
      check(Number.isInteger(count) && count >= 1 && count <= 8, 'Session count must be 1..8');
      const sessions = [];
      for (let i = 0; i < count; i++) sessions.push(await createSession((values.name || 'test-session') + (count > 1 ? `-${i + 1}` : '')));
      value = { sessions };
    } else if (action === 'list') value = { sessions: await listSessions() };
    else {
      check(values.id, 'session action requires --id');
      const selection = values.select ? { mode: values.select, count: Number(values.count), min: Number(values['min-score']), max: Number(values['max-score']) } : undefined;
      const options = { request: values.request, config: values.config, model: values.model, selection, scoring_failure: values['scoring-failure'], ...(action === 'campaign' ? { campaign: { ...(values.rounds !== undefined ? { rounds: Number(values.rounds) } : {}), ...(values['max-seconds'] !== undefined ? { max_seconds: Number(values['max-seconds']) } : {}), ...(values['max-model-turns'] !== undefined ? { max_model_turns: Number(values['max-model-turns']) } : {}) } } : {}) };
      if (action === 'inspect') value = await inspectSession(values.id);
      else if (action === 'logs') value = await sessionLogs(values.id);
      else if (action === 'run' || action === 'campaign') { check(values.request, 'session run requires --request'); value = await startSession(values.id, options); }
      else if (action === 'stop') value = await stopSession(values.id);
      else if (action === 'clear') value = await clearSession(values.id);
      else if (action === 'restart') value = await restartSession(values.id, options);
      else throw new Error('Unknown session action');
    }
    output({ schema_version: '1.0', command: `session ${action}`, ...value }); return;
  }
  if (command === 'init') { output(complete(await initialize(values.config, values['import-config']))); return; }
  if (command === 'example') { output(complete(await createExample(values.directory))); return; }
  if (command === 'handoff') { check(values.from, 'handoff requires --from'); output(await readJSON(path.resolve(values.from, 'coding-handoff.json'))); return; }
  if (command === 'feedback') {
    check(values.from && values.regression, 'feedback requires --from and --regression');
    const result = await recordFeedback(values.from, values.regression);
    output(result); process.exitCode = result.overall_status === 'regression_passed' ? 0 : 4; return;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  let result;
  try {
    const outputRoot = path.resolve(values.output || runsHome());
    const policy = values.select ? { mode: values.select, ...(values.count !== undefined ? { count: Number(values.count) } : {}), ...(values['min-score'] !== undefined ? { min: Number(values['min-score']) } : {}), ...(values['max-score'] !== undefined ? { max: Number(values['max-score']) } : {}) } : undefined;
    if (command === 'replay') {
      check(values.from, 'replay requires --from');
      result = await replay(values.from, policy ?? { mode: 'all' }, { signal: controller.signal, outputRoot });
    } else if (command === 'regress') {
      check(values.from && values.project, 'regress requires --from and --project');
      result = await regress(values.from, values.project, { signal: controller.signal, outputRoot });
    } else if (command === 'connect') {
      result = complete(await connect(positionals[1] || 'status', await configPath(values.config), controller.signal));
    } else {
      const config = await loadConfig(values.config);
      if (command === 'models') {
        const model = values.model || config.default_model || 'flash-direct';
        if (values.probe) check(config.models[model], 'Model alias is not configured');
        const probe = values.probe ? await probeModel(config, model, controller.signal) : undefined;
        result = complete({ ok: !probe || probe.ok, default_model: config.default_model || 'flash-direct', models: Object.keys(config.models).map((alias) => ({ alias })), ...(probe ? { probe } : {}) });
      } else if (command === 'doctor') {
        result = complete(await doctor(config, { probe: values.probe, model: values.model, signal: controller.signal, browser: values.browser }));
      } else {
        check(values.request, 'run requires --request');
        const task = await readJSON(values.request);
        if (policy) task.selection = policy;
        if (values['scoring-failure']) task.scoring_failure = values['scoring-failure'];
        const runOptions = { model: values.model, signal: controller.signal, outputRoot };
        result = command === 'campaign' ? await runCampaign(task, config, { ...runOptions, ...(values.rounds !== undefined ? { rounds: Number(values.rounds) } : {}), ...(values['max-seconds'] !== undefined ? { max_seconds: Number(values['max-seconds']) } : {}), ...(values['max-model-turns'] !== undefined ? { max_model_turns: Number(values['max-model-turns']) } : {}) }) : await runTask(task, config, runOptions);
      }
    }
    if (controller.signal.aborted) result.run_status = 'cancelled';
    output(result); process.exitCode = exitCode(result);
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

// npm installs bin entries as symlinks. Resolve them before detecting the entrypoint.
if (process.argv[1] && await fs.realpath(process.argv[1]).catch(() => '') === import.meta.filename) main().catch((error) => {
  if (error.code === 'SESSION_BUSY') { output({ schema_version: '1.0', run_status: 'blocked', assessment: 'inconclusive', error_code: 'SESSION_BUSY', error: 'Session is active or requires recovery. Inspect it; stop and wait before clear/restart.' }); process.exitCode = 2; return; }
  const code = error.code === 'EEXIST' ? 'ALREADY_EXISTS' : error.code === 'ENOENT' ? 'FILE_NOT_FOUND' : 'INVALID_INPUT_OR_CONFIG';
  output({ schema_version: '1.0', run_status: 'blocked', assessment: 'inconclusive', error_code: code, error: code === 'ALREADY_EXISTS' ? 'Destination already exists; choose another path. Existing data was preserved.' : 'Check askjev --help, private configuration, input paths and installed dependencies. Run askjev doctor for connection diagnostics.' }); process.exitCode = 2;
});
