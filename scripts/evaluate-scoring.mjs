import fs from 'node:fs/promises';
import { loadConfig } from '../src/model.mjs';
import { CANDIDATES, postDecision } from '../src/scoring.mjs';
import { saveJSON } from '../src/common.mjs';

const config = await loadConfig();
const cases = [
  { id: 'sum-correct', state: 'Requirement: add(2,3) must return 5. Source: function add(a,b){return a+b;}', expected: 'supported' },
  { id: 'sum-wrong', state: 'Requirement: add(2,3) must return 5. Source: function add(a,b){return a-b;}', expected: 'violated' },
  { id: 'boundary-correct', state: 'Requirement: valid(10) must return true. Source: function valid(q){return q>=1 && q<=10;}', expected: 'supported' },
  { id: 'boundary-wrong', state: 'Requirement: valid(10) must return true. Source: function valid(q){return q>=1 && q<10;}', expected: 'violated' },
  { id: 'missing-source', state: 'Requirement: add(2,3) must return 5. The implementation of add is unavailable. There are no execution logs.', expected: 'unknown' },
];
const results = [];
for (const c of cases) {
  const attempts = [];
  for (let n = 0; n < 3; n++) {
    const started = performance.now();
    const r = await postDecision(config.scoring.baseUrl, { state: c.state, questions: [{ id: c.id, type: 'choice', question: 'Does the implementation meet the stated expected behavior?', options: CANDIDATES }] });
    attempts.push({ choice: r.results[0].choice, probabilities: r.results[0].probabilities, elapsed_ms: performance.now() - started, correct: r.results[0].choice === c.expected, model_revision: r.model_revision });
  }
  results.push({ ...c, attempts });
}
await fs.mkdir('artifacts/evaluation', { recursive: true });
await saveJSON('artifacts/evaluation/scoring-evaluation.json', results);
console.log(JSON.stringify({ cases: results.length, requests: results.flatMap((r) => r.attempts).length, correct: results.flatMap((r) => r.attempts).filter((a) => a.correct).length, details: results.map((r) => ({ id: r.id, expected: r.expected, choices: r.attempts.map((a) => a.choice) })) }, null, 2));
