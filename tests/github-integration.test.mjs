import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { snapshot, validateTask, verifySnapshot, saveJSON, requirementReferences, normalizePrepared } from '../src/common.mjs';
import { runBaseline } from '../src/baseline.mjs';
import { scoreContext } from '../src/scoring.mjs';
import { createHandoff, recordFeedback } from '../src/handoff.mjs';
import { runTask } from '../src/runner.mjs';

test('upstream JS and uvu baseline run unchanged in a snapshot, outside model context', { skip: process.platform !== 'darwin' }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-upstream-'));
  try {
    const project = path.join(root, 'project'); await fs.mkdir(path.join(project, 'test'), { recursive: true });
    await fs.writeFile(path.join(project, 'index.js'), 'export const value=42;');
    await fs.writeFile(path.join(project, 'readme.md'), 'value is 42');
    await fs.writeFile(path.join(project, 'test/index.js'), "import {test} from 'uvu';import * as assert from 'uvu/assert';import {value} from '../index.js';test('value',()=>assert.is(value,42));test.run();");
    const task = validateTask({ schema_version: '1.0', project, objective: 'check value', files: ['index.js', 'readme.md'], requirement_file: 'readme.md', baseline: { framework: 'uvu', files: ['test/index.js'], entrypoints: ['test/index.js'] }, budget: { max_duration_seconds: 20, max_cases: 2, max_model_turns: 10, max_test_attempts: 1 } });
    const snap = await snapshot(task, path.join(root, 'run'));
    assert.equal(snap.sources.length, 2); assert.equal(snap.files.length, 3);
    const result = await runBaseline(task, snap);
    assert.equal(result.status, 'passed', JSON.stringify(result)); assert.equal(result.counts.pass, 1);
    await fs.writeFile(path.join(project, 'test/index.js'), "import {test} from 'uvu';import * as assert from 'uvu/assert';test('existing failure',()=>assert.is(1,2));test.run();");
    const blocked = await runTask({ ...task, model: 'fixture' }, { models: { fixture: {} } }, { outputRoot: path.join(root, 'failed-runs'), progress: () => {} });
    assert.equal(blocked.baseline.status, 'baseline_failed');
    assert.equal(blocked.findings.length, 0); assert.equal(blocked.statistics.model_turns, 0);
    assert.equal(blocked.assessment, 'inconclusive');
    await fs.writeFile(path.join(project, 'test/index.js'), '// changed');
    await assert.rejects(verifySnapshot(snap), /changed/);
  } finally { await fs.rm(root, { force: true, recursive: true }); }
});

test('scoring includes referenced source and requirement excerpts, not README benchmarks', async () => {
  const result = await scoreContext({ mode: 'mock', response: { results: [{ id: 'a', choice: 'supported', probabilities: { supported: 1, violated: 0, unknown: 0 } }] } }, { summary: 'check', items: [{ case_id: 'a', expected: '42', scenario: 'read value', source_ref: 'index.js', requirement_ref: 'value is 42' }] }, { sources: [{ path: 'index.js', content: 'export const value=42;' }, { path: 'readme.md', content: 'unrelated benchmark table'.repeat(1000) }] });
  assert.match(result.request.state, /export const value/); assert.doesNotMatch(result.request.state, /benchmark table/);
  assert.match(result.request.questions[0].question, /value is 42/);
});

test('coding handoff excludes unconfirmed issues and preserves reproduction references', () => {
  const result = { run_id: 'r', snapshot_id: 's', run_status: 'partial', artifacts: { directory: '/tmp/run' }, findings: [{ finding_id: 'f', case_id: 'a', category: 'confirmed_product_defect', evidence: 'evidence/a.json' }, { case_id: 'b', category: 'suspected_issue' }], limitations: [] };
  const h = createHandoff(result, { items: [{ case_id: 'a', source_ref: 'index.js', requirement_ref: 'value is 42' }] }, [{ case_id: 'a', file: 'tests/a.test.mjs', sha256: 'hash' }]);
  assert.equal(h.defects.length, 1); assert.equal(h.run_status, 'partial'); assert.equal(h.defects[0].source_file, 'index.js'); assert.equal(h.defects[0].test_sha256, 'hash');
});

test('feedback rejects unrelated regressions and does not hide baseline failures', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-feedback-'));
  try {
    const original = path.join(root, 'original'), regression = path.join(root, 'regression');
    await fs.mkdir(original); await fs.mkdir(regression);
    const tests = [{ case_id: 'a', file: 'tests/a.test.mjs', sha256: 'hash' }];
    await saveJSON(path.join(original, 'tests.json'), tests); await saveJSON(path.join(regression, 'tests.json'), tests);
    await saveJSON(path.join(original, 'result.json'), { run_id: 'r', snapshot_id: 's', findings: [{ category: 'confirmed_product_defect', finding_id: 'f', case_id: 'a' }] });
    const result = { run_id: 'reg', original_run_id: 'other', original_snapshot_id: 's', tests_unchanged: true, scores_reused: false, run_status: 'completed', assessment: 'inconclusive', statistics: { executed_cases: 1, failed_cases: 0 }, baseline: { status: 'baseline_failed' }, regressions: [{ finding_id: 'f', status: 'passed' }] };
    await saveJSON(path.join(regression, 'result.json'), result);
    await assert.rejects(recordFeedback(original, regression), /does not belong/);
    result.original_run_id = 'r'; await saveJSON(path.join(regression, 'result.json'), result);
    assert.equal((await recordFeedback(original, regression)).overall_status, 'requires_attention');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('requirement IDs preserve exact Markdown and minimum scope cannot silently collapse', () => {
  const requirement = '> Supports `DataView` and `ArrayBuffer` with independent cloned values.';
  const task = { files: ['src/index.js'], budget: { min_cases: 2, max_cases: 4 } };
  const ref = requirementReferences(requirement)[0];
  const item = { case_id: 'a', source_ref: 'src/index.js', requirement_id: ref.id };
  assert.throws(() => normalizePrepared({ items: [item] }, task, requirement), /min\/max/);
  const normalized = normalizePrepared({ items: [item, { ...item, case_id: 'b' }] }, task, requirement);
  assert.equal(normalized.items[0].requirement_ref, requirement);
  assert.throws(() => normalizePrepared({ items: [item, { ...item, case_id: 'b', requirement_id: 'invented' }] }, task, requirement), /requirement_id/);
});
