#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
const exec = promisify(execFile);
const skillRoot = path.resolve(import.meta.dirname, '..');
const read = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const save = async (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });

export async function install({ prefix, skillsDir, registerSkill = true } = {}) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || major === 22 && minor < 19) throw new Error('Node.js >=22.19 is required');
  const manifest = await read(path.join(skillRoot, 'assets/runtime.json'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.package !== '@403-forbidden/askjev-agent') throw new Error('Invalid runtime manifest');
  const archive = path.join(skillRoot, 'assets/runtime.tgz');
  if (crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex') !== manifest.sha256) throw new Error('Runtime checksum mismatch');
  const destination = path.resolve(prefix || path.join(os.homedir(), '.local/share/askjev-agent', manifest.version));
  const marker = path.join(destination, '.askjev-install.json');
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  if (!(await fs.readdir(destination)).every((s) => s === '.install-lock') && !await fs.access(marker).then(() => true, () => false)) throw new Error('Nonempty unmanaged installation directory');
  const lock = path.join(destination, '.install-lock');
  await fs.mkdir(lock);
  try {
    const entry = path.join(destination, 'node_modules/@403-forbidden/askjev-agent/src/cli.mjs');
    const existing = await read(marker).catch(() => null);
    const installed = await exec(process.execPath, [entry, '--version'], { timeout: 20000 }).catch(() => null);
    if (existing?.sha256 !== manifest.sha256 || installed?.stdout.trim() !== `askJEV Agent ${manifest.version}`) {
      // Mark this directory as managed before npm runs, permitting a failed install to be retried.
      await save(marker, { version: manifest.version, sha256: manifest.sha256, state: 'installing' });
      await exec('npm', ['install', '--prefix', destination, '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', archive], { timeout: 300000, maxBuffer: 2000000 });
    }
    const { stdout } = await exec(process.execPath, [entry, '--version'], { timeout: 20000 });
    if (stdout.trim() !== `askJEV Agent ${manifest.version}`) throw new Error('Installed CLI version mismatch');
    const capitalAlias = path.join(destination, 'node_modules/.bin/askJEV');
    try { await fs.symlink('askjev', capitalAlias); }
    catch (e) {
      // Case-insensitive filesystems already resolve askJEV to askjev.
      if (e.code !== 'EEXIST' || await fs.realpath(capitalAlias) !== await fs.realpath(entry)) throw new Error('Existing command alias was preserved');
    }
    await save(marker, { version: manifest.version, sha256: manifest.sha256, state: 'ready' });
    const target = registerSkill ? path.resolve(skillsDir || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'), 'askjev-agent') : skillRoot;
    if (target !== skillRoot && (target.startsWith(skillRoot + path.sep) || skillRoot.startsWith(target + path.sep))) throw new Error('Skill source and destination must not overlap');
    if (target !== skillRoot) {
      const found = await fs.lstat(target).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
      if (found) {
        if (found.isSymbolicLink()) throw new Error('Skill target must not be a symlink');
        const old = await read(path.join(target, 'install.json')).catch(() => null);
        if (old?.managed_by !== 'askjev-agent-installer') throw new Error('Existing unrelated skill was preserved');
      }
      await fs.mkdir(target, { recursive: true, mode: 0o700 });
      await fs.cp(skillRoot, target, { recursive: true, filter: (source) => !['install.json'].includes(path.basename(source)) });
    }
    const receipt = { managed_by: 'askjev-agent-installer', version: manifest.version, sha256: manifest.sha256, prefix: destination, entry, skill_directory: target, commands: Object.fromEntries(['askjev', 'askJEV', 'pi-test-agent'].map((name) => [name, path.join(destination, 'node_modules/.bin', name)])) };
    await save(path.join(target, 'install.json'), receipt);
    return { ...receipt, cli_ready: true, model_configuration_required: true, note: 'CLI and approved Skills are installed. API keys, cloud configuration, Node.js and Chrome are not bundled.' };
  } finally { await fs.rmdir(lock); }
}

if (process.argv[1] && await fs.realpath(process.argv[1]).catch(() => '') === import.meta.filename) {
  const { values } = parseArgs({ options: { prefix: { type: 'string' }, 'skills-dir': { type: 'string' } } });
  try { console.log(JSON.stringify(await install({ prefix: values.prefix, skillsDir: values['skills-dir'] }))); }
  catch { console.log(JSON.stringify({ ok: false, error: 'Installation failed. Check Node/npm, package checksum, writable destination and network. Existing unrelated skills are not overwritten.' })); process.exitCode = 2; }
}
