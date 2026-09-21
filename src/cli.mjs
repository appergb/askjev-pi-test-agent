#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadConfig } from './model.mjs';
import { runTask, regress } from './runner.mjs';
import { ROOT, check, readJSON } from './common.mjs';
import { executeTest } from './execution.mjs';
import { recordFeedback } from './handoff.mjs';

export function exitCode(result) {
  if (result.run_status === 'cancelled') return 5;
  if (result.run_status === 'partial') return 4;
  if (result.run_status !== 'completed') return 3;
  if (result.assessment === 'inconclusive') return 4;
  return result.assessment === 'confirmed_findings' ? 1 : 0;
}

async function main() {
  const { values, positionals } = parseArgs({ options: { config: { type: 'string' }, request: { type: 'string' }, model: { type: 'string' }, from: { type: 'string' }, regression: { type: 'string' }, project: { type: 'string' } }, allowPositionals: true });
  if (positionals[0] === 'handoff') {
    check(values.from, 'handoff requires --from');
    process.stdout.write(JSON.stringify(await readJSON(path.join(values.from, 'coding-handoff.json'))) + '\n'); return;
  }
  if (positionals[0] === 'feedback') {
    check(values.from && values.regression, 'feedback requires --from and --regression');
    process.stdout.write(JSON.stringify(await recordFeedback(values.from, values.regression)) + '\n'); return;
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
  let result;
  try {
    if (positionals[0] === 'regress') {
      check(values.from && values.project, 'regress requires --from and --project');
      result = await regress(values.from, values.project, { signal: controller.signal });
    } else {
      const config = await loadConfig(values.config);
      if (positionals[0] === 'doctor') {
        const response = await fetch(new URL('status', config.scoring.baseUrl + '/'), { signal: AbortSignal.timeout(15000), redirect: 'error' });
        check(response.ok && (await response.json()).ready === true, 'Cloud scoring service is not ready');
        const dir = path.join(ROOT, '.runtime/doctor'); await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'probe.test.mjs'), "import test from 'node:test';import assert from 'node:assert/strict';test('doctor',()=>assert.equal(1,1));\n");
        const execution = await executeTest(dir, 'probe.test.mjs', { signal: controller.signal });
        check(execution.classification === 'passed', 'Sandbox cannot execute Node tests');
        result = { schema_version: '1.0', run_status: 'completed', assessment: 'no_confirmed_findings', scoring_ready: true, sandbox_ready: true, configured_models: Object.keys(config.models), note: 'Model authentication and tool calling are checked by the benchmark or an actual run.' };
      } else {
        check(positionals[0] === 'run' && values.request, 'Use doctor, run --request <task.json>, or regress --from <run-dir> --project <project>');
        result = await runTask(await readJSON(values.request), config, { model: values.model, signal: controller.signal });
      }
    }
    process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = exitCode(result);
  } finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) main().catch(() => {
  process.stdout.write(JSON.stringify({ schema_version: '1.0', run_status: 'blocked', assessment: 'inconclusive', error: 'Invalid input/configuration, unavailable dependency, or failed preflight. Check private configuration, request paths and model tunnel.' }) + '\n'); process.exitCode = 2;
});
