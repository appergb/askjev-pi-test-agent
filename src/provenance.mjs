import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);

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
    return { repository, git_commit: commit.trim(), selected_files_modified: Boolean(status.trim()), selected_status: status.trim().split('\n').filter(Boolean) };
  } catch { return { git_commit: null, selected_files_modified: null }; }
}
