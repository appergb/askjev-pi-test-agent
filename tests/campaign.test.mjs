import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { runCampaign, campaignLimits, testFingerprint } from '../src/campaign.mjs';
import { validateTask, saveJSON, sha } from '../src/common.mjs';
import { scoreQuality, scoreWithPolicy } from '../src/scoring.mjs';

const taskAt = (project) => ({ schema_version: '1.0', project, files: ['app.mjs', 'requirements.md'], requirement_file: 'requirements.md', objective: 'Check the requirement', budget: { max_duration_seconds: 20, max_cases: 1, max_model_turns: 10, max_test_attempts: 1 } });
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-campaign-'));
  await fs.writeFile(path.join(root, 'app.mjs'), 'export const add=(a,b)=>a-b;');
  await fs.writeFile(path.join(root, 'requirements.md'), 'The sum of 2 and 3 must be 5.');
  const contexts = []; let calls = 0;
  const runTask = async (task, config, options) => {
    calls++; contexts.push(options.campaignContext);
    const directory = path.join(options.outputRoot, `fixture-${calls}`); await fs.mkdir(directory, { recursive: true });
    const snap = JSON.parse(await fs.readFile(path.join(options.outputRoot, '..', 'snapshot.json')));
    const item = { case_id: 'sum', scenario: '2 plus 3', expected: '5', source_ref: 'app.mjs', requirement_ref: 'The sum of 2 and 3 must be 5.' };
    await saveJSON(path.join(directory, 'prepared.json'), { items: [item] });
    await fs.mkdir(path.join(directory, 'workspace/tests'), { recursive: true });
    await fs.writeFile(path.join(directory, 'workspace/tests/sum.test.mjs'), 'unchanged fixture');
    await saveJSON(path.join(directory, 'tests.json'), [{ case_id: 'sum', file: 'tests/sum.test.mjs', sha256: sha('unchanged fixture') }]);
    const result = { run_id: `fixture-${calls}`, snapshot_id: snap.snapshot_id, run_status: 'completed', assessment: 'confirmed_findings', selection: { selected_ids: ['sum'] }, unfinished: [], statistics: { model_turns: Math.min(6, task.budget.max_model_turns), executed_cases: 1, failed_cases: 1 }, findings: [{ finding_id: `f-${calls}`, case_id: 'sum', category: 'confirmed_product_defect' }], artifacts: { directory, result: path.join(directory, 'result.json'), handoff: path.join(directory, 'coding-handoff.json') } };
    await saveJSON(result.artifacts.result, result); await saveJSON(result.artifacts.handoff, {}); return result;
  };
  let replayCalls = 0;
  const replay = async (from, policy, options) => {
    replayCalls++; const dir = path.join(options.outputRoot, `replay-${replayCalls}`); await fs.mkdir(dir, { recursive: true });
    const result = { run_status: 'completed', statistics: { executed_cases: 1 }, findings: [{ case_id: 'sum', category: 'suspected_issue', evidence: 'sum.json' }], artifacts: { directory: dir, result: path.join(dir, 'result.json') } };
    await saveJSON(result.artifacts.result, result); return result;
  };
  try { await fn({ root, task: taskAt(root), deps: { runTask, replay }, contexts, calls: () => calls, replayCalls: () => replayCalls }); }
  finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('campaign persists rounds, reproduces failures, feeds uncovered hints and stops on stagnation', () => fixture(async ({ root, task, deps, contexts, calls, replayCalls }) => {
  const result = await runCampaign(task, {}, { outputRoot: path.join(root, 'runs'), rounds: 8, stagnation_rounds: 1, progress: () => {} }, deps);
  assert.equal(result.stop_reason, 'no_new_scenarios'); assert.equal(result.run_status, 'completed');
  assert.equal(calls(), 2); assert.equal(replayCalls(), 2); assert.equal(result.statistics.reproduced_assertions, 2);
  assert.equal(result.assessment, 'confirmed_findings'); assert.equal(contexts[0].unreferenced_requirements.length, 1); assert.equal(contexts[1].unreferenced_requirements.length, 0);
  assert.equal(contexts[1].previously_tested_scenarios.length, 1);
  assert.deepEqual(JSON.parse(await fs.readFile(result.artifacts.result)), result);
  assert.equal(JSON.parse(await fs.readFile(result.artifacts.handoff)).findings.length, 2);
  assert.ok((await fs.stat(result.artifacts.result)).mode & 0o600); assert.equal((await fs.stat(result.artifacts.result)).mode & 0o077, 0);
}));

test('campaign global model budget stops further rounds and preserves completed evidence', () => fixture(async ({ root, task, deps, calls }) => {
  const result = await runCampaign(task, {}, { outputRoot: path.join(root, 'runs'), rounds: 4, max_model_turns: 6, progress: () => {} }, deps);
  assert.equal(calls(), 1); assert.equal(result.stop_reason, 'model_turn_budget'); assert.equal(result.run_status, 'partial');
  assert.equal(result.statistics.model_turns, 6); assert.equal(result.findings[0].reproduction_status, 'assertion_reproduced');
}));

test('cancellation prevents subsequent rounds without reporting success', () => fixture(async ({ root, task, deps, calls }) => {
  const controller = new AbortController();
  const result = await runCampaign(task, {}, { outputRoot: path.join(root, 'runs'), signal: controller.signal, progress: () => {} }, { ...deps, runTask: async (...args) => { const r = await deps.runTask(...args); controller.abort(); return r; } });
  assert.equal(calls(), 1); assert.equal(result.run_status, 'cancelled'); assert.equal(result.stop_reason, 'cancelled');
  assert.equal(result.findings[0].reproduction_status, 'not_reproduced'); assert.equal(result.assessment, 'inconclusive');
}));

test('campaign refuses original source changes between rounds', () => fixture(async ({ root, task, deps, calls }) => {
  const result = await runCampaign(task, {}, { outputRoot: path.join(root, 'runs'), progress: () => {} }, { ...deps, runTask: async (...args) => { const r = await deps.runTask(...args); await fs.writeFile(path.join(root, 'app.mjs'), 'export const changed=true;'); return r; } });
  assert.equal(calls(), 1); assert.equal(result.run_status, 'partial'); assert.equal(result.stop_reason, 'source_changed');
  assert.equal(result.rounds.length, 1);
}));

test('non-reproducing findings stay inconclusive; failed reproduction is retained', () => fixture(async ({ root, task, deps }) => {
  const result = await runCampaign(task, {}, { rounds: 1, outputRoot: path.join(root, 'runs'), progress: () => {} }, { ...deps, replay: async (...args) => ({ ...await deps.replay(...args), findings: [] }) });
  assert.equal(result.assessment, 'inconclusive'); assert.equal(result.findings[0].reproduction_status, 'not_reproduced');
}));

test('scoring outage fallback uses null scores; cancellation and strict mode never silently degrade', async () => {
  const prepared = { items: [{ case_id: 'a', expected: '5' }] };
  const scorer = async () => { throw new Error('private network endpoint'); };
  const fallback = await scoreWithPolicy({}, prepared, {}, undefined, 'all', scorer);
  assert.equal(fallback.items[0].score, null); assert.equal(fallback.backend_mode, 'unavailable');
  assert.ok(!JSON.stringify(fallback).includes('private network endpoint'));
  await assert.rejects(scoreWithPolicy({}, prepared, {}, undefined, 'strict', scorer));
  await assert.rejects(scoreWithPolicy({}, prepared, {}, AbortSignal.abort(), 'all', scorer));
  assert.throws(() => validateTask({ ...taskAt('/tmp/project'), selection: { mode: 'lowest', count: 1 }, scoring_failure: 'all' }));
});

test('score diagnostics expose saturated ties without claiming calibrated confidence', () => {
  const q = scoreQuality(Array.from({ length: 6 }, (_, i) => ({ case_id: String(i), status: 'scored', score: i === 5 ? 0.1 : 1 })));
  assert.ok(q.reasons.includes('score_ties')); assert.ok(q.reasons.includes('score_saturation')); assert.equal(q.calibrated, false);
  assert.equal(scoreQuality([{ status: 'scored', score: 0.3 }]).status, 'unvalidated');
  for (const options of [{ rounds: 0 }, { max_model_turns: -1 }, { max_seconds: NaN }, { stagnation_rounds: 100 }]) assert.throws(() => campaignLimits(options));
});

test('stagnation fingerprints ignore scenario rewording and read-only assertion order, preserving different inputs', () => {
 const item = { source_ref: 'app.js', requirement_ref: 'The expected total is 5.', scenario: 'scenario one' };
 const steps = [{ action: 'fill', selector: '#q', value: '1' }, { action: 'text', selector: '#total', value: '5' }, { action: 'text', selector: '#shipping', value: '0' }];
 const a = testFingerprint(item, JSON.stringify({ schema_version: '1.0', steps }), true);
 assert.equal(a, testFingerprint({ ...item, scenario: 'entirely different wording' }, JSON.stringify({ steps: [steps[0], steps[2], steps[1]], schema_version: '1.0' }), true));
 assert.notEqual(a, testFingerprint(item, JSON.stringify({ schema_version: '1.0', steps: [{ ...steps[0], value: '2' }, ...steps.slice(1)] }), true));
});
