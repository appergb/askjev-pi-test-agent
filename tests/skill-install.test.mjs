import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../src/common.mjs';
const exec = promisify(execFile);
test('standalone skill installer rejects tampered archives and preserves unmanaged destinations before npm runs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-install-'));
  try {
    const skill = path.join(root, 'skill'); await fs.mkdir(path.join(skill, 'scripts'), { recursive: true }); await fs.mkdir(path.join(skill, 'assets'));
    const installer = path.join(skill, 'scripts/install.mjs'); await fs.copyFile(path.join(ROOT, 'skills/codex/askjev-agent/scripts/install.mjs'), installer);
    const archive = Buffer.from('not a runtime'); await fs.writeFile(path.join(skill, 'assets/runtime.tgz'), archive);
    const manifest = { package: '@403-forbidden/askjev-agent', version: '1.4.0', sha256: 'wrong' };
    await fs.writeFile(path.join(skill, 'assets/runtime.json'), JSON.stringify(manifest));
    const prefix = path.join(root, 'destination');
    await assert.rejects(exec(process.execPath, [installer, '--prefix', prefix]), (e) => e.code === 2 && JSON.parse(e.stdout).ok === false);
    assert.equal(await fs.access(prefix).then(() => true, () => false), false);
    manifest.sha256 = crypto.createHash('sha256').update(archive).digest('hex');
    await fs.writeFile(path.join(skill, 'assets/runtime.json'), JSON.stringify(manifest));
    await fs.mkdir(prefix); await fs.writeFile(path.join(prefix, 'keep.txt'), 'existing user data');
    await assert.rejects(exec(process.execPath, [installer, '--prefix', prefix]), (e) => e.code === 2);
    assert.equal(await fs.readFile(path.join(prefix, 'keep.txt'), 'utf8'), 'existing user data');
    assert.deepEqual(await fs.readdir(prefix), ['keep.txt']);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
