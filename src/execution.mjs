import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { check } from './common.mjs';

function quoted(s) { return JSON.stringify(s); }
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

export async function executeTest(workspace, testFile, { signal, timeout = 10000, framework = 'node-test', readRoots = [] } = {}) {
  check(process.platform === 'darwin', 'MVP sandbox supports macOS only');
  const node = await fs.realpath(process.execPath);
  const cwd = await fs.realpath(workspace);
  check(['node-test', 'uvu'].includes(framework), 'Unsupported execution framework');
  const command = framework === 'uvu' ? [node, testFile] : [node, '--test', '--test-isolation=none', '--test-reporter=tap', testFile];
  const args = ['-p', seatbeltProfile(cwd, node, readRoots), ...command];
  const started_at = new Date().toISOString();
  const start = performance.now();
  const result = await new Promise((resolve) => {
    let stdout = '', stderr = '', ended = false, stop_reason = null;
    const child = spawn('/usr/bin/sandbox-exec', args, { cwd, env: { PATH: '/usr/bin:/bin', HOME: cwd, TMPDIR: cwd, LANG: 'en_US.UTF-8', OPENSSL_CONF: '/dev/null' }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
      if (stdout.length + stderr.length > 150000) { stdout = stdout.slice(0, 75000); stderr = stderr.slice(0, 75000); kill('output_limit'); }
    };
    child.stdout.on('data', (d) => collect('stdout', d.toString()));
    child.stderr.on('data', (d) => collect('stderr', d.toString()));
    child.on('error', (e) => finish(null, e));
    child.on('close', (code, exitSignal) => finish(code, null, exitSignal));
  });
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
  let classification = result.exit_code === 0 && (framework === 'uvu' || declaredTests.length > 0) && counts.tests > 0 && counts.pass === counts.tests && counts.skipped === 0 ? 'passed' : assertion_failure ? 'assertion_failure' : 'test_error';
  if (result.spawn_error || result.stop_reason || result.exit_signal || /sandbox-exec:|Operation not permitted|EPERM|EACCES/.test(result.stderr + result.stdout)) classification = 'environment_error';
  return { ...result, counts, classification, assertion_failure, started_at, duration_ms: performance.now() - start, command, framework, sandbox: 'macos-seatbelt-restricted-v1' };
}
