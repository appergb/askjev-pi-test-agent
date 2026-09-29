import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { check } from './common.mjs';

// macOS sandbox executor: runs a single node:test or uvu test file inside a
// Seatbelt profile that denies network, fork and writes, parses TAP/summary
// counters, and classifies every outcome — passed, assertion_failure,
// test_error (broken generated test) or environment_error (sandbox/infra).

function quoted(s) { return JSON.stringify(s); }
/**
 * Render the Seatbelt profile for one execution: a default-deny baseline with
 * narrow allow rules — reads limited to system libraries and approved subpaths,
 * writes only to /dev/null, process-exec limited to the resolved Node binary.
 * @param {string} workspace Workspace root the test may read.
 * @param {string} nodeBinary Realpath of the Node executable.
 * @param {string[]} [readRoots] Extra readable subpaths (e.g. bundled node_modules).
 * @returns {string} Seatbelt profile text (sandbox-exec scheme format).
 */
export function seatbeltProfile(workspace, nodeBinary, readRoots = []) {
  const reads = ['/System', '/Library/Apple', '/usr/lib', '/usr/share', '/private/var/db/dyld', '/opt/homebrew/Cellar', workspace, ...readRoots];
  return `(version 1)
(allow default)
(deny network*)
(deny process-fork)
(deny process-exec)
(deny file-read-data)
(deny file-write*)
(allow file-read-data ${reads.map((p) => `(subpath ${quoted(p)})`).join(' ')} (literal "/") (literal "/dev/null") (literal "/dev/urandom") (literal "/dev/random"))
(allow file-write* (literal "/dev/null"))
(allow process-exec (literal ${quoted(nodeBinary)}))
(allow signal (target self))
`;
}

/**
 * Execute one test file inside the Seatbelt sandbox and classify the result.
 * macOS only. The child runs with a scrubbed environment and its combined
 * output is capped, so neither host state nor a runaway test can leak in or
 * exhaust the runner.
 * @param {string} workspace Workspace directory to run in (realpath'd).
 * @param {string} testFile Relative path of the test file inside workspace.
 * @param {object} [options] { signal?, timeout?=10000, framework?='node-test', readRoots?=[] }
 * @returns {Promise<object>} Execution record: exit info, counters, classification, timing.
 * @throws {Error} On non-macOS platforms or an unknown framework.
 */
export async function executeTest(workspace, testFile, { signal, timeout = 10000, framework = 'node-test', readRoots = [] } = {}) {
  check(process.platform === 'darwin', 'MVP sandbox supports macOS only');
  const node = await fs.realpath(process.execPath);
  const cwd = await fs.realpath(workspace);
  check(['node-test', 'uvu'].includes(framework), 'Unsupported execution framework');
  const command = framework === 'uvu' ? [node, testFile] : [node, '--test', '--experimental-test-isolation=none', '--test-reporter=tap', testFile];
  const args = ['-p', seatbeltProfile(cwd, node, readRoots), ...command];
  const started_at = new Date().toISOString();
  const start = performance.now();
  const result = await new Promise((resolve) => {
    let stdout = '', stderr = '', ended = false, stop_reason = null;
    // Node propagates NODE_V8_COVERAGE even to an explicit env; sandboxed tests
    // must not inherit the host runner's writable coverage destination.
    const child = spawn('/usr/bin/sandbox-exec', args, { cwd, env: { PATH: '/usr/bin:/bin', HOME: cwd, TMPDIR: cwd, LANG: 'en_US.UTF-8', OPENSSL_CONF: '/dev/null', NODE_V8_COVERAGE: '' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = (reason) => { stop_reason ||= reason; try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(() => kill('timeout'), timeout);
    const abort = () => kill('cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const finish = (code, error, exitSignal) => {
      if (ended) return; ended = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      resolve({ exit_code: code, exit_signal: exitSignal, stdout, stderr, stop_reason, ...(error ? { spawn_error: true } : {}) });
    };
    const collect = (key, data) => {
      if (key === 'stdout') stdout += data; else stderr += data;
      // Hard output cap: excess is truncated and the child is killed, so a
      // runaway test cannot exhaust the runner's memory.
      if (stdout.length + stderr.length > 150000) { stdout = stdout.slice(0, 75000); stderr = stderr.slice(0, 75000); kill('output_limit'); }
    };
    child.stdout.on('data', (d) => collect('stdout', d.toString()));
    child.stderr.on('data', (d) => collect('stderr', d.toString()));
    child.on('error', (e) => finish(null, e));
    child.on('close', (code, exitSignal) => finish(code, null, exitSignal));
  });
  // TAP summary lines (# tests/pass/...) are authoritative for node:test; uvu
  // prints plain-text totals with ANSI color codes, stripped below.
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map((k) => [k, Number(result.stdout.match(new RegExp(`^# ${k} (\\d+)$`, 'm'))?.[1] ?? 0)]));
  if (framework === 'uvu') {
    const clean = result.stdout.replace(/\u001b\[[0-9;]*m/g, '');
    counts.tests = Number(clean.match(/Total:\s+(\d+)/)?.[1] ?? 0);
    counts.pass = Number(clean.match(/Passed:\s+(\d+)/)?.[1] ?? 0);
    counts.skipped = Number(clean.match(/Skipped:\s+(\d+)/)?.[1] ?? 0);
    counts.fail = counts.tests - counts.pass;
  }
  const declaredTests = [...result.stdout.matchAll(/^# Subtest: (.+)$/gm)].filter((m) => ![testFile, path.basename(testFile), path.join(cwd, testFile)].includes(m[1]));
  const assertion_failure = result.exit_code !== 0 && /ERR_ASSERTION/.test(result.stdout);
  // A pass requires exit 0, declared subtests, everything passing, none skipped.
  // assertion_failure outranks test_error; environment_error dominates both —
  // sandbox or infrastructure noise must never be reported as a product defect.
  let classification = result.exit_code === 0 && (framework === 'uvu' || declaredTests.length > 0) && counts.tests > 0 && counts.pass === counts.tests && counts.skipped === 0 ? 'passed' : assertion_failure ? 'assertion_failure' : 'test_error';
  if (result.spawn_error || result.stop_reason || result.exit_signal || /sandbox-exec:|Operation not permitted|EPERM|EACCES/.test(result.stderr + result.stdout)) classification = 'environment_error';
  return { ...result, counts, classification, assertion_failure, started_at, duration_ms: performance.now() - start, command, framework, sandbox: 'macos-seatbelt-restricted-v1' };
}
