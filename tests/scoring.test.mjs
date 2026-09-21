import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScores, orderItems, postDecision, scoreContext } from '../src/scoring.mjs';

const items = [{ case_id: 'a', expected: 'works' }, { case_id: 'b', expected: 'works too' }];
const row = (id, p = { supported: 0.1, violated: 0.8, unknown: 0.1 }, choice = 'violated') => ({ id, probabilities: p, choice });

test('normal scores preserve candidate semantics; missing items are unscored rather than zero', () => {
  const r = normalizeScores({ results: [row('a')] }, items);
  assert.equal(r[0].score, 0.1); assert.equal(r[0].score_kind, 'candidate_conditional_support');
  assert.equal(r[1].status, 'unscored'); assert.equal(r[1].score, null);
});
test('unknown winner requests context and is not assigned a low score', () => {
  const [r] = normalizeScores({ results: [row('a', { supported: 0.1, violated: 0.1, unknown: 0.8 }, 'unknown')] }, items);
  assert.equal(r.status, 'needs_context'); assert.equal(r.score, null);
});
test('invalid numeric values and mismatched winners cannot enter ranking', () => {
  for (const p of [{ supported: NaN, violated: 0.5, unknown: 0.5 }, { supported: -0.1, violated: 1, unknown: 0.1 }, { supported: 0.2, violated: 0.2, unknown: 0.2 }, { supported: '0.1', violated: 0.8, unknown: 0.1 }]) {
    assert.equal(normalizeScores({ results: [row('a', p)] }, items)[0].status, 'invalid');
  }
  assert.equal(normalizeScores({ results: [row('a', undefined, 'supported')] }, items)[0].status, 'invalid');
});
test('unknown or duplicate backend IDs reject the response', () => {
  assert.throws(() => normalizeScores({ results: [row('x')] }, items), /Unknown/);
  assert.throws(() => normalizeScores({ results: [row('a'), row('a')] }, items), /Duplicate/);
});
test('baseline remains first, then unscored exploration and lower supported scores', () => {
  const cases = [{ case_id: 'a' }, { case_id: 'b', baseline: true }, { case_id: 'c' }, { case_id: 'd' }];
  const scores = [{ case_id: 'a', score: 0.9 }, { case_id: 'b', score: 1 }, { case_id: 'c', score: 0.1 }, { case_id: 'd', score: null }];
  assert.deepEqual(orderItems(cases, scores).map((i) => i.case_id), ['b', 'd', 'c', 'a']);
});
test('authentication errors are not retried or converted into scores', async () => {
  let calls = 0;
  await assert.rejects(postDecision('https://example.invalid', {}, { fetcher: async () => { calls++; return new Response('', { status: 401 }); } }), /401/);
  assert.equal(calls, 1);
});
test('transient errors retry finitely with a stable request ID', async () => {
  const ids = [];
  await assert.rejects(postDecision('https://example.invalid', { state: 'x' }, { fetcher: async (_url, o) => { ids.push(o.headers['X-Request-ID']); return new Response('', { status: 503 }); } }), /503/);
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
});
test('cancelled requests stop immediately without retry', async () => {
  let calls = 0;
  const c = new AbortController(); c.abort();
  await assert.rejects(postDecision('https://example.invalid', {}, { signal: c.signal, fetcher: async () => { calls++; throw new DOMException('cancel', 'AbortError'); } }), /cancelled/);
  assert.equal(calls, 1);
});

test('scoring timeouts use the configured abort signal and stop after bounded retries', async () => {
  let calls = 0;
  await assert.rejects(postDecision('https://example.invalid', {}, { timeout: 5, retries: 1, fetcher: async (_url, options) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 15));
    options.signal.throwIfAborted();
    throw new Error('timeout signal did not fire');
  } }), /transport or output/);
  assert.equal(calls, 2);
});
test('Mock responses are explicitly distinguished from real backend evidence', async () => {
  const r = await scoreContext({ mode: 'mock', response: { results: [row('a')] } }, { summary: 'Example', items: items.slice(0, 1) }, { sources: [] });
  assert.equal(r.backend_mode, 'mock'); assert.equal(r.items[0].score, 0.1);
});
