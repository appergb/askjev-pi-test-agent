import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

// Best-effort Git provenance for the run manifest: commit, GitHub origin and
// whether selected files carry uncommitted changes. Never fails a run — a
// missing Git, a non-GitHub remote or any error degrades to null fields.

/**
 * Collect Git metadata for a snapshot. All Git invocations are best effort
 * with tight timeouts; failures resolve to null fields instead of throwing,
 * so evidence identity never blocks testing.
 * @param {string} project Project root directory.
 * @param {string[]} files Snapshot file paths to check for modifications.
 * @returns {Promise<object>} { repository, git_commit, selected_files_modified, selected_status }
 */
export async function provenance(project, files) {
  try {
    const options = { cwd: project, timeout: 5000, maxBuffer: 200000 };
    const { stdout: commit } = await exec('git', ['rev-parse', 'HEAD'], options);
    const { stdout: status } = await exec('git', ['status', '--porcelain', '--', ...files], options);
    let repository = null;
    try {
      const { stdout } = await exec('git', ['remote', 'get-url', 'origin'], options);
      const match = stdout.trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
      if (match) repository = `https://github.com/${match[1]}`;
    } catch {}
    // Non-GitHub or absent remote is fine; repository stays null.
    return { repository, git_commit: commit.trim(), selected_files_modified: Boolean(status.trim()), selected_status: status.trim().split('\n').filter(Boolean) };
  } catch { return { git_commit: null, selected_files_modified: null }; }
}
