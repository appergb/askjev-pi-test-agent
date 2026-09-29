import { validateSelection } from './common.mjs';
export { validateSelection } from './common.mjs';
import { orderItems } from './scoring.mjs';

// Explicit case-selection policies over scored candidates. Selection decides
// what executes; unselected cases are untested — never counted as passing.

/**
 * Apply a validated selection policy to scored candidates. 'all' mirrors the
 * full score list re-ranked baseline-first; lowest/highest take a prefix of
 * the score-sorted items; range filters by inclusive score bounds. Every
 * excluded case gets a skipped reason (no valid numeric score vs. policy).
 * @param {Array<object>} items Prepared inspection items.
 * @param {Array<object>} scores Score records from normalizeScores.
 * @param {object} [policy] Validated selection policy (default all).
 * @returns {object} Selection envelope persisted as selection.json.
 */
export function selectItems(items, scores, policy = { mode: 'all' }) {
  validateSelection(policy);
  const byId = new Map(scores.map((s) => [s.case_id, s]));
  const ranked = items.filter((i) => byId.get(i.case_id)?.status === 'scored' && Number.isFinite(byId.get(i.case_id).score));
  // Only numerically scored items are rankable; 'highest' flips the comparator.
  // Ties always break by case_id so runs are reproducible despite rounding.
  ranked.sort((a, b) => (policy.mode === 'highest' ? -1 : 1) * (byId.get(a.case_id).score - byId.get(b.case_id).score) || a.case_id.localeCompare(b.case_id, 'en'));
  const selected = policy.mode === 'all' ? orderItems(items, scores) : policy.mode === 'range' ? ranked.filter((i) => byId.get(i.case_id).score >= policy.min && byId.get(i.case_id).score <= policy.max) : ranked.slice(0, policy.count);
  const selectedIds = new Set(selected.map((i) => i.case_id));
  return { ranking: scores.map((s) => ({ case_id: s.case_id, score: s.score, status: s.status })), policy, selected_ids: [...selectedIds], skipped: items.filter((i) => !selectedIds.has(i.case_id)).map((i) => ({ case_id: i.case_id, reason: byId.get(i.case_id)?.status !== 'scored' ? 'no_valid_numeric_score' : 'outside_selection', score: byId.get(i.case_id)?.score ?? null })), tie_break: 'case_id ascending; equal scores do not imply different risk', score_semantics: 'Uncalibrated implementation-support probability, not user-behavior frequency or measured bug probability.' };
}
