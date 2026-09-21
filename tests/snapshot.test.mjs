import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { snapshot, verifySnapshot, relativeFile, validateTask } from '../src/common.mjs';

test('snapshot includes current uncommitted bytes and changes when source changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-snapshot-'));
  try {
    await fs.mkdir(path.join(root, 'project'));
    await fs.writeFile(path.join(root, 'project/source.mjs'), 'export const x=1');
    const t = { project: path.join(root, 'project'), files: ['source.mjs'] };
    const first = await snapshot(t, path.join(root, 'run1'));
    await verifySnapshot(first);
    await fs.writeFile(path.join(root, 'project/source.mjs'), 'export const x=2');
    await assert.rejects(verifySnapshot(first), /changed/);
    const second = await snapshot(t, path.join(root, 'run2'));
    assert.notEqual(first.snapshot_id, second.snapshot_id);
    assert.equal(second.sources[0].content, 'export const x=2');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('paths cannot traverse, include hidden files, credentials or symlinks', async () => {
  for (const file of ['../secret', '/etc/passwd', '.env', 'docs/private/key.txt', 'a/../../b', 'a\\b']) assert.throws(() => relativeFile(file));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-symlink-'));
  try {
    await fs.writeFile(path.join(root, 'outside.mjs'), 'secret');
    await fs.symlink(path.join(root, 'outside.mjs'), path.join(root, 'source.mjs'));
    await assert.rejects(snapshot({ project: root, files: ['source.mjs'] }, path.join(root, 'out')), /Symlinks/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test('task budgets and requirement inclusion are validated before execution', () => {
  assert.throws(() => validateTask({ schema_version: '1.0', project: '.', objective: 'check', files: ['source.mjs'], requirement_file: 'missing.md' }), /Requirement/);
});
