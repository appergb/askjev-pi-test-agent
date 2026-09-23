import test from 'node:test';
import assert from 'node:assert/strict';
import { selectItems, validateSelection } from '../src/selection.mjs';
const items = [{ case_id: 'z', baseline: true }, { case_id: 'b' }, { case_id: 'a' }, { case_id: 'u' }];
const scores = [{ case_id: 'z', status: 'scored', score: 0.9 }, { case_id: 'b', status: 'scored', score: 0.1 }, { case_id: 'a', status: 'scored', score: 0.1 }, { case_id: 'u', status: 'needs_context', score: null }];
test('explicit numeric selection executes exactly N candidates, excludes unknown and does not force baselines', () => {
  assert.deepEqual(selectItems(items, scores, { mode: 'lowest', count: 2 }).selected_ids, ['a', 'b']);
  assert.deepEqual(selectItems(items, scores, { mode: 'highest', count: 1 }).selected_ids, ['z']);
  assert.deepEqual(selectItems(items, scores, { mode: 'range', min: 0.1, max: 0.1 }).selected_ids, ['a', 'b']);
  const empty = selectItems(items, scores, { mode: 'range', min: 0.2, max: 0.3 });
  assert.equal(empty.selected_ids.length, 0); assert.equal(empty.skipped.length, 4);
  assert.equal(empty.skipped.find((i) => i.case_id === 'u').reason, 'no_valid_numeric_score');
});
test('default all retains baseline-first behavior and includes unscored exploration', () => {
  assert.deepEqual(selectItems(items, scores).selected_ids, ['z', 'u', 'b', 'a']);
});
test('selection rejects invalid counts and ranges rather than silently testing a different scope', () => {
  for (const p of [{ mode: 'lowest', count: 0 }, { mode: 'highest', count: 1.5 }, { mode: 'range', min: 0.8, max: 0.2 }, { mode: 'range', min: 0, max: 2 }, { mode: 'something' }]) assert.throws(() => validateSelection(p));
});
