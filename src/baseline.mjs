import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './common.mjs';
import { executeTest } from './execution.mjs';
const require = createRequire(import.meta.url);

export async function runBaseline(task, snap, signal) {
  if (!task.baseline) return { status: 'not_configured', results: [], counts: { tests: 0, pass: 0, fail: 0 } };
  const results = [];
  for (const [i, entry] of task.baseline.entrypoints.entries()) {
    if (signal?.aborted) break;
    let file = entry;
    const options = { signal, timeout: 30000, framework: task.baseline.framework };
    if (task.baseline.framework === 'uvu') {
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
