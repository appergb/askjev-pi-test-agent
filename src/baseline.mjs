import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './common.mjs';
import { executeTest } from './execution.mjs';
const require = createRequire(import.meta.url);

// Baseline gate: run the project's own pre-existing node:test or uvu tests
// before any new-defect discovery. A failing baseline blocks the run — the
// agent must not report new findings on top of an already-broken test suite.

/**
 * Run configured baseline entrypoints inside the sandbox and aggregate counts.
 * uvu is CJS, so a generated bootstrap loads it through jiti with the module
 * alias pinned to the bundled node_modules/uvu — the one case where baseline
 * code may read outside the workspace (read-only, never installed into).
 * @param {object} task Validated task document.
 * @param {object} snap Snapshot providing the workspace root.
 * @param {AbortSignal} [signal] Cancellation signal.
 * @returns {Promise<object>} { status, framework?, counts, results } where
 *   status is not_configured, passed, baseline_failed or cancelled.
 */
export async function runBaseline(task, snap, signal) {
  if (!task.baseline) return { status: 'not_configured', results: [], counts: { tests: 0, pass: 0, fail: 0 } };
  const results = [];
  for (const [i, entry] of task.baseline.entrypoints.entries()) {
    if (signal?.aborted) break;
    let file = entry;
    const options = { signal, timeout: 30000, framework: task.baseline.framework };
    if (task.baseline.framework === 'uvu') {
      // Generated CJS bootstrap: jiti imports the ESM uvu entry suite with the
      // module alias pinned to the bundled uvu; no npm install/build ever runs.
      file = `pi-baseline-${i}.cjs`;
      const code = `const {createJiti}=require(${JSON.stringify(require.resolve('jiti'))});\nconst jiti=createJiti(__filename,{fsCache:false,moduleCache:false,alias:{'uvu':${JSON.stringify(path.join(ROOT, 'node_modules/uvu'))}}});\njiti(${JSON.stringify('./' + entry)});\n`;
      await fs.writeFile(path.join(snap.workspace, file), code, { mode: 0o400 });
      options.readRoots = [path.join(ROOT, 'node_modules')];
    }
    results.push({ entry, ...await executeTest(snap.workspace, file, options) });
  }
  const counts = { tests: 0, pass: 0, fail: 0 };
  for (const r of results) for (const k of Object.keys(counts)) counts[k] += r.counts[k];
  return { status: signal?.aborted ? 'cancelled' : results.every((r) => r.classification === 'passed') ? 'passed' : 'baseline_failed', framework: task.baseline.framework, counts, results };
}
