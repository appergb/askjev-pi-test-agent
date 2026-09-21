import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const VERSION = '1.1.0';
export const isJavaScript = (file) => /\.(?:mjs|cjs|js)$/.test(file);
export const ROOT = path.resolve(import.meta.dirname, '..');
export const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const json = (value) => JSON.stringify(value, null, 2) + '\n';
export const readJSON = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
export const saveJSON = async (file, value) => fs.writeFile(file, json(value), { mode: 0o600 });
export function check(condition, message) { if (!condition) throw new Error(message); }
export function safeName(value) { return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value); }
export function relativeFile(value) {
  check(typeof value === 'string' && value.length < 200 && !value.includes('\\') && !path.isAbsolute(value) && value.split('/').every((part) => part && part !== '.' && part !== '..'), 'Invalid relative file');
  check(!/(^|\/)(\.|node_modules|private|secrets|credentials)/i.test(value) && !/\.(pem|key|env)$/i.test(value), 'Excluded input path');
  return value;
}
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
export function validateTask(t) {
  check(t?.schema_version === '1.0', 'Expected task schema_version 1.0');
  check(typeof t.project === 'string' && typeof t.objective === 'string' && t.objective.length > 0 && t.objective.length <= 4000, 'Invalid task project/objective');
  check(Array.isArray(t.files) && t.files.length > 0 && t.files.length <= 20 && new Set(t.files).size === t.files.length, 'Invalid input file list');
  t.files.forEach(relativeFile);
  check(t.files.includes(t.requirement_file), 'Requirement file must be included');
  check(t.files.some(isJavaScript), 'A JavaScript source file is required');
  check(!t.files.some((f) => f.startsWith('tests/')), 'tests/ is reserved for Pi generated tests; use baseline.files for existing tests');
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

export function requirementReferences(text) {
  return [...new Set(text.split('\n').map((line) => line.trim()).filter((line) => line.length >= 20 && line.length <= 500 && !line.startsWith('```')))].slice(0, 100).map((quote, i) => ({ id: `req-${String(i + 1).padStart(3, '0')}`, quote }));
}

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
    check(size <= 512000, 'Snapshot exceeds 512 KB; narrow baseline.files');
    if (task.files.includes(name)) contextSize += Buffer.byteLength(content);
    check(contextSize <= 16000, 'MVP context exceeds 16 KB; narrow task.files');
    check(!/-----BEGIN [\w ]*PRIVATE KEY-----|\b(?:sk-[a-zA-Z0-9_-]{20,}|AKIA[A-Z0-9]{16})/.test(content), 'Possible credential in selected source');
    const target = path.join(workspace, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, { mode: 0o400 });
    const entry = { path: name, content, sha256: sha(content) };
    files.push(entry);
    if (task.files.includes(name)) sources.push(entry);
  }
  const snapshot_id = sha(json(files.map(({ path, sha256 }) => ({ path, sha256 }))));
  await fs.mkdir(path.join(workspace, 'tests'), { mode: 0o700, recursive: true });
  return { root, workspace, snapshot_id, sources, files };
}

export async function verifySnapshot(snap) {
  for (const source of snap.files ?? snap.sources) {
    for (const root of [snap.root, snap.workspace]) {
      const file = await plainFile(root, source.path);
      check(sha(await fs.readFile(file)) === source.sha256, 'Business source changed during run');
    }
  }
}
