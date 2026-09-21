import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readJSON, ROOT, check } from '../src/common.mjs';
const exec = promisify(execFile);
const config = await readJSON(path.join(ROOT, 'examples/github-klona/repository.json'));
const checkout = path.join(ROOT, config.checkout);
const exists = await fs.stat(checkout).then(() => true, () => false);
if (!exists) {
  await fs.mkdir(path.dirname(checkout), { recursive: true });
  await exec('git', ['clone', '--no-checkout', '--filter=blob:none', config.repository, checkout], { timeout: 120000 });
  await exec('git', ['-C', checkout, 'checkout', '--detach', config.commit], { timeout: 60000 });
}
const { stdout } = await exec('git', ['-C', checkout, 'rev-parse', 'HEAD']);
check(stdout.trim() === config.commit, 'Existing checkout has another revision; it was not modified');
console.log(JSON.stringify({ repository: config.repository, commit: config.commit, checkout, existing_checkout: exists }));
