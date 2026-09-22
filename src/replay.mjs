import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJSON, saveJSON, validateTask, snapshot, verifySnapshot, safeName, check, sha, VERSION } from './common.mjs';
import { selectItems } from './selection.mjs';
import { executeBrowser } from './browser.mjs';
import { executeTest } from './execution.mjs';
import { runsHome } from './paths.mjs';
import { renderReport } from './runner.mjs';

// A controlled comparison uses saved source, scores and tests, never a new model response.
export async function replay(from, policy, { signal, outputRoot = runsHome() } = {}) {
  const started = performance.now();
  const priorDir = await fs.realpath(from);
  const prior = await readJSON(path.join(priorDir, 'result.json'));
  const task = validateTask(await readJSON(path.join(priorDir, 'task.json')));
  const prepared = await readJSON(path.join(priorDir, 'prepared.json'));
  const scores = await readJSON(path.join(priorDir, 'scores.json'));
  const tests = await readJSON(path.join(priorDir, 'tests.json'));
  check(prepared.run_id === prior.run_id && scores.run_id === prior.run_id && scores.snapshot_id === prior.snapshot_id && prepared.snapshot_id === prior.snapshot_id, 'Comparison artifacts do not belong to one snapshot');
  const browser = task.execution?.type === 'browser';
  check(tests.length === prepared.items.length && new Set(tests.map((t) => t.case_id)).size === tests.length && tests.every((t) => safeName(t.case_id) && prepared.items.some((i) => i.case_id === t.case_id) && t.file === `tests/${t.case_id}.${browser ? 'browser.json' : 'test.mjs'}`), 'Comparison requires all original test plans');
  task.project = path.join(priorDir, 'workspace');
  task.selection = policy;
  validateTask(task);
  const run_id = `replay-${crypto.randomUUID()}`;
  const dir = path.resolve(outputRoot, run_id);
  await fs.mkdir(path.join(dir, 'evidence'), { recursive: true, mode: 0o700 });
  const snap = await snapshot(task, dir);
  check(snap.snapshot_id === prior.snapshot_id, 'Saved source changed; scores cannot be reused');
  for (const t of tests) {
    const bytes = await fs.readFile(path.join(priorDir, 'workspace', t.file));
    check(sha(bytes) === t.sha256, 'Saved tests changed; comparison refused');
    await fs.writeFile(path.join(snap.workspace, t.file), bytes, { mode: 0o400 });
  }
  const selection = selectItems(prepared.items, scores.items, policy);
  const deadline = AbortSignal.timeout(task.budget.max_duration_seconds * 1000);
  const runSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const executions = [];
  for (const id of selection.selected_ids) {
    if (runSignal.aborted) break;
    const t = tests.find((t) => t.case_id === id);
    const e = { case_id: id, test_sha256: t.sha256, ...await (browser ? executeBrowser(snap.workspace, t.file, { execution: task.execution, signal: runSignal, screenshot: path.join(dir, 'evidence', `${id}.png`) }) : executeTest(snap.workspace, t.file, { signal: runSignal })), evidence: `evidence/${id}.json` };
    executions.push(e);
    await saveJSON(path.join(dir, e.evidence), e);
  }
  await verifySnapshot(snap);
  const failures = executions.filter((e) => e.classification !== 'passed');
  const result = { schema_version: '1.0', type: 'selection_replay', run_id, original_run_id: prior.run_id, snapshot_id: snap.snapshot_id, scores_reused: true, tests_unchanged: true, run_status: signal?.aborted ? 'cancelled' : deadline.aborted ? 'partial' : 'completed', assessment: failures.length || !executions.length ? 'inconclusive' : 'no_confirmed_findings', duration_ms: performance.now() - started, scope: task.files, selection,
    statistics: { planned: prepared.items.length, selected: selection.selected_ids.length, skipped: selection.skipped.length, executed_cases: executions.length, passed_cases: executions.length - failures.length, failed_cases: failures.length, assertion_failures: failures.filter((e) => e.classification === 'assertion_failure').length },
    findings: failures.map((e) => { const item = prepared.items.find((i) => i.case_id === e.case_id); return { case_id: e.case_id, category: e.classification === 'assertion_failure' ? 'suspected_issue' : e.classification, title: item.scenario, expected: item.expected, actual: e.stdout, evidence: e.evidence, evidence_excerpt: e.stdout }; }),
    unfinished: selection.selected_ids.filter((id) => !executions.some((e) => e.case_id === id)), errors: [], limitations: ['Frozen comparison only: no new model analysis; failed assertions require contract review.', 'Excluded cases remain untested in this replay. This is not a repair regression.'], artifacts: { directory: dir, result: path.join(dir, 'result.json'), report: path.join(dir, 'report.md') } };
  await saveJSON(result.artifacts.result, result);
  await saveJSON(path.join(dir, 'selection.json'), selection);
  await saveJSON(path.join(dir, 'manifest.json'), { version: VERSION, original_run_id: prior.run_id, snapshot_id: snap.snapshot_id, tests_unchanged: true, scores_reused: true });
  await fs.writeFile(result.artifacts.report, renderReport(result, prepared, executions));
  return result;
}
