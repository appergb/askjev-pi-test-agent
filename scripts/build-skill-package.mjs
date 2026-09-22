import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, readJSON, saveJSON } from '../src/common.mjs';
const exec = promisify(execFile);
const pkg = await readJSON(path.join(ROOT, 'package.json'));
const releases = path.join(ROOT, 'artifacts/releases');
await fs.mkdir(releases, { recursive: true });
const { stdout } = await exec('npm', ['pack', '--ignore-scripts', '--pack-destination', releases, '--json'], { cwd: ROOT, timeout: 60000 });
const packed = JSON.parse(stdout)[0];
const archive = path.join(releases, packed.filename);
const sha256 = crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');
const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'askjev-skill-build-'));
try {
  const skill = path.join(stage, 'askjev-agent');
  await fs.cp(path.join(ROOT, 'skills/codex/askjev-agent'), skill, { recursive: true });
  await fs.mkdir(path.join(skill, 'assets'));
  await fs.copyFile(archive, path.join(skill, 'assets/runtime.tgz'));
  await saveJSON(path.join(skill, 'assets/runtime.json'), { package: pkg.name, version: pkg.version, sha256 });
  const bundle = path.join(releases, `askjev-agent-skill-${pkg.version}.tar.gz`);
  await exec('tar', ['-czf', bundle, '-C', stage, 'askjev-agent'], { env: { ...process.env, COPYFILE_DISABLE: '1' }, timeout: 60000 });
  const checksum = crypto.createHash('sha256').update(await fs.readFile(bundle)).digest('hex');
  await saveJSON(path.join(releases, `askjev-agent-skill-${pkg.version}.json`), { bundle: path.basename(bundle), sha256: checksum, runtime_sha256: sha256, runtime: packed.filename });
  console.log(JSON.stringify({ bundle, sha256: checksum, runtime: archive, runtime_sha256: sha256 }));
} finally { await fs.rm(stage, { recursive: true, force: true }); }
