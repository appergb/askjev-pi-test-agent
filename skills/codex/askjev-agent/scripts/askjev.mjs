#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { install } from './install.mjs';
const root = path.resolve(import.meta.dirname, '..');
try {
  let receipt = await fs.readFile(path.join(root, 'install.json'), 'utf8').then(JSON.parse).catch(() => null);
  if (!receipt || !await fs.access(receipt.entry).then(() => true, () => false)) receipt = await install({ registerSkill: false });
  const child = spawn(process.execPath, [receipt.entry, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
  const forward = (signal) => child.kill(signal);
  const interrupt = () => forward('SIGINT'); const terminate = () => forward('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  child.on('error', () => { process.exitCode = 2; });
  child.on('exit', (code) => { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate); process.exitCode = code ?? 5; });
} catch { console.log(JSON.stringify({ ok: false, error: 'Skill bootstrap failed. Run this skill\'s scripts/install.mjs and check the bundled runtime.' })); process.exitCode = 2; }
