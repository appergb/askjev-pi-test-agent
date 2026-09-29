import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Shared primitives and the security-validation heart of the agent. Every
// module builds on these helpers; validateTask, snapshot and verifySnapshot
// here define what input is acceptable and how the immutable source snapshot
// is protected. VERSION must stay in sync with the version in package.json.

/** Application version; keep in sync with package.json. */
export const VERSION = '1.5.0';
/** Recognized JavaScript source extensions that may enter a snapshot. */
export const isJavaScript = (file) => /\.(?:mjs|cjs|js)$/.test(file);
/** Repository root (parent of src/), resolved from this module's location. */
export const ROOT = path.resolve(import.meta.dirname, '..');
/** SHA-256 hex digest of a string. */
export const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
/** Canonical pretty JSON serialization (2-space indent, trailing newline). */
export const json = (value) => JSON.stringify(value, null, 2) + '\n';
/** Read and parse a UTF-8 JSON file. */
export const readJSON = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
/** Write canonical JSON with owner-only permissions (0o600). */
export const saveJSON = async (file, value) => fs.writeFile(file, json(value), { mode: 0o600 });
/** Throw an Error carrying a model/user-facing message when the condition is falsy. */
export function check(condition, message) { if (!condition) throw new Error(message); }
/** Identifier safety: 1-64 chars, starts alphanumeric, then alphanumerics, underscores or hyphens. */
export function safeName(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value); }
/**
 * Validate a task-declared relative path: rejects absolute paths, Windows
 * separators, traversal segments and overlong names, then applies the
 * content denylist below.
 * @param {string} value Path as written in task.files.
 * @returns {string} The same value after validation.
 * @throws {Error} On the first violated rule.
 */
export function relativeFile(value) {
  check(typeof value === 'string' && value.length < 200 && !value.includes('\\') && !path.isAbsolute(value) && value.split('/').every((part) => part && part !== '.' && part !== '..'), 'Invalid relative file');
  // Content denylist: hidden entries, dependency trees, secret directories
  // and key material are never accepted as task input.
  check(!/(^|\/)(\.|node_modules|private|secrets|credentials)/i.test(value) && !/\.(pem|key|env)$/i.test(value), 'Excluded input path');
  return value;
}
/**
 * Resolve a validated relative path beneath root to a real regular file,
 * rejecting any symbolic link along every path segment.
 * @param {string} root Snapshot or workspace root directory.
 * @param {string} name Validated relative path.
 * @returns {Promise<string>} Absolute path of the regular file.
 * @throws {Error} If any segment is a symlink or the target is not a file.
 */
export async function plainFile(root, name) {
  relativeFile(name);
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    check(!(await fs.lstat(current)).isSymbolicLink(), 'Symlinks are not accepted');
  }
  check((await fs.stat(current)).isFile(), 'Expected regular file');
  return current;
}
/**
 * Validate a selection policy. Modes: all; lowest/highest with count 1..12;
 * range with min/max within 0..1. The CLI derives the same object from --select.
 * @param {object} [policy] Selection policy from the task or the CLI.
 * @returns {object} The same policy after validation.
 * @throws {Error} On an invalid mode, count or range.
 */
export function validateSelection(policy = { mode: 'all' }) {
  check(policy && ['all', 'lowest', 'highest', 'range'].includes(policy.mode), 'Invalid selection mode');
  if (['lowest', 'highest'].includes(policy.mode)) check(Number.isInteger(policy.count) && policy.count >= 1 && policy.count <= 12, 'Selection count must be 1..12');
  if (policy.mode === 'range') check(Number.isFinite(policy.min) && Number.isFinite(policy.max) && 0 <= policy.min && policy.min <= policy.max && policy.max <= 1, 'Selection range must be within 0..1');
  return policy;
}

/**
 * Validate the full task document: schema, project/objective, file list,
 * selection, scoring-failure policy, optional browser execution plan and
 * baseline, budget ranges. Mutates nothing; returns the same object.
 * @param {object} t Parsed task.json.
 * @returns {object} The same task after validation.
 * @throws {Error} Naming the first violated rule.
 */
export function validateTask(t) {
  check(t?.schema_version === '1.0', 'Expected task schema_version 1.0');
  check(typeof t.project === 'string' && typeof t.objective === 'string' && t.objective.length > 0 && t.objective.length <= 4000, 'Invalid task project/objective');
  check(Array.isArray(t.files) && t.files.length > 0 && t.files.length <= 20 && new Set(t.files).size === t.files.length, 'Invalid input file list');
  t.files.forEach(relativeFile);
  check(t.files.includes(t.requirement_file), 'Requirement file must be included');
  check(t.files.some(isJavaScript), 'A JavaScript source file is required');
  // tests/ is reserved for Agent-generated tests; existing suites join via baseline.files instead.
  check(!t.files.some((f) => f.startsWith('tests/')), 'tests/ is reserved for Agent generated tests; use baseline.files for existing tests');
  validateSelection(t.selection);
  if (t.scoring_failure !== undefined) {
    check(['strict', 'all'].includes(t.scoring_failure), 'Invalid scoring failure policy');
    // 'all' keeps executing the full candidate set when scoring fails; an
    // explicit subset cannot be silently expanded to all cases.
    check(t.scoring_failure !== 'all' || (t.selection?.mode ?? 'all') === 'all', 'Scoring fallback requires all selection; explicit subsets cannot be expanded');
  }
  if (t.execution) {
    check(t.execution.type === 'browser', 'Unsupported execution type');
    check(Array.isArray(t.execution.assets) && t.execution.assets.length > 0 && t.execution.assets.every((f) => t.files.includes(f) && /\.(html|js|mjs|css|json)$/.test(f)), 'Browser assets must be approved source files');
    check(t.execution.assets.includes(t.execution.entry) && t.execution.entry.endsWith('.html'), 'Browser entry must be an approved HTML asset');
  }
  if (t.baseline) {
    check(['uvu', 'node-test'].includes(t.baseline.framework), 'Unsupported baseline framework');
    check(Array.isArray(t.baseline.files) && t.baseline.files.length <= 200, 'Invalid baseline files');
    t.baseline.files.forEach(relativeFile);
    check(Array.isArray(t.baseline.entrypoints) && t.baseline.entrypoints.length > 0 && t.baseline.entrypoints.length <= 20, 'Invalid baseline entrypoints');
    t.baseline.entrypoints.forEach((file) => check(isJavaScript(file) && [...t.files, ...t.baseline.files].includes(file), 'Baseline entrypoint must be an included JavaScript file'));
  }
  const limits = { max_duration_seconds: [10, 1800], max_cases: [1, 12], max_model_turns: [1, 40], max_test_attempts: [1, 3] };
  for (const [key, [min, max]] of Object.entries(limits)) check(Number.isInteger(t.budget?.[key]) && t.budget[key] >= min && t.budget[key] <= max, `Invalid budget ${key}`);
  if (t.budget.min_cases !== undefined) check(Number.isInteger(t.budget.min_cases) && t.budget.min_cases >= 1 && t.budget.min_cases <= t.budget.max_cases, 'Invalid minimum case budget');
  return t;
}

/**
 * Extract stable requirement reference IDs from requirement text: trimmed
 * non-fenced lines of 20-500 chars, deduplicated, capped at 100, returned
 * as ordered { id: req-NNN, quote } pairs the agent can cite instead of
 * copying free-form quotes.
 * @param {string} text Raw requirement document text.
 * @returns {Array<{id: string, quote: string}>} Ordered requirement references.
 */
export function requirementReferences(text) {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => line.length >= 20 && line.length <= 500 && !line.startsWith('```')))].slice(0, 100).map((quote, i) => ({ id: `req-${String(i + 1).padStart(3, '0')}`, quote }));
}

/**
 * Validate the agent's prepared inspection items against the task and the
 * requirement text: enforce the min/max case budget, resolve each item's
 * requirement_id to its exact quote (or verify a legacy requirement_ref is
 * an exact quote), and confirm source_ref names an approved JS file.
 * @param {object} prepared Prepared batch submitted via the askJEV tool.
 * @param {object} task Validated task document.
 * @param {string} requirementText Raw requirement text from the snapshot.
 * @returns {object} Prepared batch with every requirement_ref resolved.
 * @throws {Error} On budget, quote or source violations.
 */
export function normalizePrepared(prepared, task, requirementText) {
  const refs = new Map(requirementReferences(requirementText).map((r) => [r.id, r.quote]));
  check(prepared.items.length >= (task.budget.min_cases ?? 1) && prepared.items.length <= task.budget.max_cases, 'Prepared case count is outside the configured min/max budget');
  return { ...prepared, items: prepared.items.map((item) => {
    const quote = item.requirement_id ? refs.get(item.requirement_id) : item.requirement_ref;
    check(typeof quote === 'string' && quote.length > 0 && requirementText.includes(quote), 'Choose a requirement_id from readProject, or provide an exact requirement_ref quote');
    check(task.files.includes(item.source_ref) && isJavaScript(item.source_ref), 'source_ref must name an approved JavaScript source');
    return { ...item, requirement_ref: quote };
  }) };
}

/**
 * Create the immutable run snapshot: copy every approved file (task.files
 * plus baseline.files) into <runDir>/workspace with read-only modes, hash
 * the contents, enforce size and credential limits, and derive the
 * snapshot_id that ties all artifacts of this run together.
 * @param {object} task Validated task document.
 * @param {string} runDir Run output directory.
 * @returns {Promise<object>} { root, workspace, snapshot_id, sources, files }
 * @throws {Error} On size, credential or filesystem violations.
 */
export async function snapshot(task, runDir) {
  const root = await fs.realpath(path.resolve(task.project));
  const workspace = path.join(runDir, 'workspace');
  await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
  const sources = [], files = [];
  let size = 0, contextSize = 0;
  for (const name of [...new Set([...task.files, ...(task.baseline?.files ?? [])])].sort()) {
    const source = await plainFile(root, name);
    const content = await fs.readFile(source, 'utf8');
    size += Buffer.byteLength(content);
    // Total snapshot stays shippable (512 KB); only task.files count against
    // the 16 KB model-visible context — baseline files are execution-only.
    check(size <= 512000, 'Snapshot exceeds 512 KB; narrow baseline.files');
    if (task.files.includes(name)) contextSize += Buffer.byteLength(content);
    check(contextSize <= 16000, 'MVP context exceeds 16 KB; narrow task.files');
    // Refuse obvious secrets (private keys, sk- tokens, AWS access keys)
    // before they can enter any artifact or model context.
    check(!/-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|AKIA[A-Z0-9]{16})/.test(content), 'Possible credential in selected source');
    const target = path.join(workspace, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Workspace copies are read-only (0o400): even the agent cannot edit business sources.
    await fs.writeFile(target, content, { mode: 0o400 });
    const entry = { path: name, content, sha256: sha(content) };
    files.push(entry);
    if (task.files.includes(name)) sources.push(entry);
  }
  const snapshot_id = sha(json(files.map(({ path, sha256 }) => ({ path, sha256 }))));
  await fs.mkdir(path.join(workspace, 'tests'), { mode: 0o700, recursive: true });
  return { root, workspace, snapshot_id, sources, files };
}

/**
 * Re-verify every snapshot file against its recorded hash at BOTH roots —
 * the original project and the run workspace — so any business source
 * change during a run (accidental or agent-caused) aborts with evidence.
 * @param {object} snap Snapshot object returned by snapshot().
 * @returns {Promise<void>} Resolves only if every hash matches.
 * @throws {Error} 'Business source changed during run' on any mismatch.
 */
export async function verifySnapshot(snap) {
  for (const source of snap.files ?? snap.sources) {
    for (const root of [snap.root, snap.workspace]) {
      const file = await plainFile(root, source.path);
      check(sha(await fs.readFile(file)) === source.sha256, 'Business source changed during run');
    }
  }
}
