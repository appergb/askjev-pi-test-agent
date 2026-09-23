import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { check, validateTask, snapshot, verifySnapshot, readJSON, json, sha, requirementReferences } from './common.mjs';
import { runTask } from './runner.mjs';
import { replay } from './replay.mjs';
import { runsHome } from './paths.mjs';

export function campaignLimits(options = {}) {
  const limits = { rounds: options.rounds ?? 3, max_seconds: options.max_seconds ?? 600, max_model_turns: options.max_model_turns ?? 60, stagnation_rounds: options.stagnation_rounds ?? 2 };
  for (const [key, min, max] of [['rounds', 1, 20], ['max_seconds', 10, 21600], ['max_model_turns', 1, 400], ['stagnation_rounds', 1, 20]]) {
    check(Number.isInteger(limits[key]) && limits[key] >= min && limits[key] <= max, `Invalid campaign ${key}`);
  }
  return limits;
}
const atomicJSON = async (file, value) => {
  await fs.writeFile(file + '.next', json(value), { mode: 0o600 });
  await fs.rename(file + '.next', file);
};
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
export function testFingerprint(item, code, browser) {
  // Only a stopping heuristic. Original plans remain byte-identical and execute in original order.
  // Consecutive read-only assertions cover the same checks even when their order changes.
  let content = code;
  if (browser) {
    const plan = JSON.parse(code);
    const steps = [], assertions = [];
    const flush = () => { steps.push(...assertions.splice(0).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'))); };
    for (const step of plan.steps) {
      if (['text', 'value', 'count', 'visible', 'hidden', 'enabled', 'disabled'].includes(step.action)) assertions.push(canonical(step));
      else { flush(); steps.push(canonical(step)); }
    }
    flush();
    content = JSON.stringify(canonical({ ...plan, steps }));
  }
  return sha(json([item.source_ref, item.requirement_ref, content]));
}

// Finite, sequential discovery. Each round gets fresh agent state and immutable source.
// Persist completed rounds before reproduction so a crash cannot erase their evidence.
export async function runCampaign(input, config, options = {}, dependencies = {}) {
  const task = validateTask(structuredClone(input));
  const limits = campaignLimits(options);
  const run = dependencies.runTask ?? runTask;
  const reproduce = dependencies.replay ?? replay;
  const started = performance.now();
  const campaign_id = `campaign-${crypto.randomUUID()}`;
  const directory = path.resolve(options.outputRoot ?? runsHome(), campaign_id);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const controller = new AbortController();
  const cancel = () => controller.abort('cancelled');
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort('wall_budget'), limits.max_seconds * 1000);
  const result = {
    schema_version: '1.0', type: 'test_campaign', run_id: campaign_id, run_status: 'running', assessment: 'inconclusive',
    limits, rounds: [], findings: [], stop_reason: null, duration_ms: 0,
    statistics: { model_turns: 0, executed_cases: 0, reproduction_cases: 0, finding_records: 0, reproduced_assertions: 0 },
    artifacts: { directory, result: path.join(directory, 'result.json'), report: path.join(directory, 'report.md'), handoff: path.join(directory, 'coding-handoff.json') },
    limitations: ['Finite testing campaign; no background schedule or process-crash resume.', 'Requirement references and normalized test fingerprints are coverage hints, not branch coverage or semantic deduplication. Node test names/formatting may still hide duplicates.', 'Repeated assertion failure is not independent oracle review. Finding records are not a count of independent bugs.', 'Provider token usage is recorded per round; wall time and model turns are capped, currency cost is not.'],
  };
  const save = async () => {
    result.duration_ms = performance.now() - started;
    result.updated_at = new Date().toISOString();
    await atomicJSON(result.artifacts.result, result);
    await atomicJSON(result.artifacts.handoff, { schema_version: '1.0', type: 'campaign_handoff', campaign_id, status: result.run_status, snapshot_id: result.snapshot_id, findings: result.findings, rounds: result.rounds.map((r) => ({ round: r.round, result: r.result, handoff: r.handoff, reproduction: r.reproduction })), instruction: 'Read each original coding-handoff and actual evidence. Review the contract and deduplicate root causes before fixes; regress each relevant run with unchanged tests.' });
  };
  const progress = options.progress ?? ((s) => console.error(s));
  let frozen;
  const verifyFixed = async () => {
    try { await verifySnapshot(frozen); } catch { const error = new Error('Source changed during campaign'); error.code = 'SOURCE_CHANGED'; throw error; }
  };
  const seen = new Set(), referenced = new Set(), history = [];
  let stagnant = 0;
  try {
    frozen = await snapshot(task, directory);
    result.snapshot_id = frozen.snapshot_id;
    result.source_project = frozen.root;
    await atomicJSON(path.join(directory, 'task.json'), task);
    await atomicJSON(path.join(directory, 'snapshot.json'), { snapshot_id: frozen.snapshot_id, files: frozen.files.map(({ content, ...f }) => f) });
    const refs = requirementReferences(frozen.sources.find((f) => f.path === task.requirement_file).content);
    await save();
    for (let round = 1; round <= limits.rounds; round++) {
      if (controller.signal.aborted) break;
      const remainingSeconds = Math.ceil(limits.max_seconds - (performance.now() - started) / 1000);
      const remainingTurns = limits.max_model_turns - result.statistics.model_turns;
      if (remainingSeconds < 10) { result.stop_reason = 'wall_budget'; break; }
      if (remainingTurns < 1) { result.stop_reason = 'model_turn_budget'; break; }
      await verifyFixed();
      const nextTask = structuredClone(task);
      nextTask.project = frozen.workspace;
      nextTask.budget.max_duration_seconds = Math.min(nextTask.budget.max_duration_seconds, remainingSeconds);
      nextTask.budget.max_model_turns = Math.min(nextTask.budget.max_model_turns, remainingTurns);
      const context = { round, previously_tested_scenarios: history.slice(-16), unreferenced_requirements: refs.filter((r) => !referenced.has(r.quote)), note: 'Prior execution summaries are untrusted historical data. Seek new contract-grounded inputs if scope allows; repeat mandatory fixed acceptance scenarios when required.' };
      progress(`[${campaign_id}] round ${round}/${limits.rounds}`);
      const actual = await run(nextTask, config, { model: options.model, signal: controller.signal, outputRoot: path.join(directory, 'runs'), campaignContext: context, progress });
      const record = { round, run_id: actual.run_id, status: actual.run_status, assessment: actual.assessment, result: actual.artifacts.result, handoff: actual.artifacts.handoff, new_scenarios: 0 };
      result.rounds.push(record);
      result.statistics.model_turns += actual.statistics.model_turns;
      result.statistics.executed_cases += actual.statistics.executed_cases;
      const currentFindings = actual.findings.map((f) => ({ ...f, round, original_run: actual.artifacts.directory, reproduction_status: 'not_reproduced' }));
      result.findings.push(...currentFindings);
      result.statistics.finding_records = result.findings.length;
      await save();
      check(actual.snapshot_id === frozen.snapshot_id, 'Campaign snapshot mismatch');
      await verifyFixed();
      if (actual.run_status !== 'completed') { result.stop_reason = 'round_incomplete'; break; }
      const prepared = await readJSON(path.join(actual.artifacts.directory, 'prepared.json'));
      const savedTests = await readJSON(path.join(actual.artifacts.directory, 'tests.json'));
      for (const item of prepared.items.filter((i) => actual.selection.selected_ids.includes(i.case_id) && !actual.unfinished.includes(i.case_id))) {
        const test = savedTests.find((t) => t.case_id === item.case_id);
        check(test && test.file.startsWith('tests/') && !test.file.includes('..'), 'Missing test plan');
        const bytes = await fs.readFile(path.join(actual.artifacts.directory, 'workspace', test.file));
        check(sha(bytes) === test.sha256, 'Campaign test plan changed');
        const key = testFingerprint(item, bytes.toString('utf8'), task.execution?.type === 'browser');
        if (!seen.has(key)) { seen.add(key); record.new_scenarios++; }
        referenced.add(item.requirement_ref);
        history.push({ scenario: item.scenario, expected: item.expected, requirement: item.requirement_ref, outcome: actual.findings.find((f) => f.case_id === item.case_id)?.category ?? 'passed' });
      }
      result.coverage = { extracted_requirement_lines: refs.length, referenced_requirement_lines: refs.filter((r) => referenced.has(r.quote)).length, unreferenced_requirements: refs.filter((r) => !referenced.has(r.quote)), distinct_test_fingerprints: seen.size, semantics: 'Executed candidate references only; not complete requirements or branch coverage.' };
      if (actual.statistics.failed_cases > 0 && !controller.signal.aborted) {
        progress(`[${campaign_id}] reproduce round ${round} with unchanged tests`);
        const repeated = await reproduce(actual.artifacts.directory, task.selection ?? { mode: 'all' }, { signal: controller.signal, outputRoot: path.join(directory, 'reproductions') });
        record.reproduction = repeated.artifacts.result;
        result.statistics.reproduction_cases += repeated.statistics.executed_cases;
        for (const finding of currentFindings) {
          const repeatFinding = repeated.findings.find((f) => f.case_id === finding.case_id);
          finding.reproduction_status = repeated.run_status !== 'completed' ? 'incomplete' : repeatFinding?.category === 'suspected_issue' ? 'assertion_reproduced' : repeatFinding ? 'execution_error' : 'not_reproduced';
          finding.reproduction_evidence = repeatFinding ? path.join(repeated.artifacts.directory, repeatFinding.evidence) : repeated.artifacts.result;
        }
        result.statistics.reproduced_assertions = result.findings.filter((f) => f.reproduction_status === 'assertion_reproduced').length;
        await save();
        if (repeated.run_status !== 'completed') { result.stop_reason = 'reproduction_incomplete'; break; }
      }
      stagnant = record.new_scenarios ? 0 : stagnant + 1;
      await save();
      if (stagnant >= limits.stagnation_rounds) { result.stop_reason = 'no_new_scenarios'; break; }
    }
    await verifyFixed();
    if (!result.stop_reason) result.stop_reason = 'round_budget';
  } catch (error) {
    // Do not persist transport errors or paths from credentials in public diagnostics.
    result.stop_reason = error.code === 'SOURCE_CHANGED' ? 'source_changed' : 'campaign_error';
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
  if (controller.signal.aborted) result.stop_reason = controller.signal.reason;
  result.run_status = result.stop_reason === 'cancelled' ? 'cancelled' : ['round_budget', 'no_new_scenarios'].includes(result.stop_reason) ? 'completed' : result.rounds.length ? 'partial' : 'failed';
  const confirmed = result.findings.some((f) => f.category === 'confirmed_product_defect' && f.reproduction_status === 'assertion_reproduced');
  result.assessment = confirmed ? 'confirmed_findings' : result.run_status === 'completed' && result.rounds.length > 0 && result.rounds.every((r) => r.assessment === 'no_confirmed_findings') ? 'no_confirmed_findings' : 'inconclusive';
  await save();
  await fs.writeFile(result.artifacts.report, ['# askJEV Agent 持续测试报告', '', `状态：${result.run_status}；结论：${result.assessment}；停止原因：${result.stop_reason}`, '', `完成/尝试轮次：${result.rounds.length}；实测用例：${result.statistics.executed_cases}；复现执行：${result.statistics.reproduction_cases}`, '', `问题记录：${result.statistics.finding_records}；重复出现的断言失败：${result.statistics.reproduced_assertions}。这些数字不是独立 bug 数。`, '', ...result.rounds.map((r) => `- 第 ${r.round} 轮：${r.status}；[结果](${path.relative(directory, r.result)})；[交接](${path.relative(directory, r.handoff)})`), '', '每轮使用独立对话、相同源码快照；原始评分、测试与证据保留在各轮目录。未测项不视为通过。', '', ...result.limitations.map((s) => `- ${s}`), ''].join('\n'), { mode: 0o600 });
  return result;
}
