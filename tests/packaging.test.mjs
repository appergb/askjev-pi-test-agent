import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT } from '../src/common.mjs';

test('distribution includes version evidence and Skills, excluding private data and runs', async () => {
  const { stdout } = await promisify(execFile)('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], { cwd: ROOT, timeout: 30000, maxBuffer: 1000000 });
  const files = JSON.parse(stdout)[0].files.map((f) => f.path);
  for (const file of ['npm-shrinkwrap.json', 'src/cli.mjs', 'src/campaign.mjs', 'docs/campaigns.md', 'skills/codex/askjev-agent/references/campaigns.md', 'src/application.mjs', 'scripts/cloud-tunnel.py', 'skills/pi/ask-jev/SKILL.md', 'skills/pi/brainstorming/SKILL.md', 'skills/pi/writing-tests/SKILL.md', 'skills/pi/bugs/SKILL.md', 'skills/pi/browser-tests/SKILL.md', 'src/browser.mjs', 'src/selection.mjs', 'src/replay.mjs', 'src/sessions.mjs', 'src/session-worker.mjs', 'skills/codex/askjev-agent/SKILL.md', 'skills/codex/askjev-agent/scripts/install.mjs', 'skills/codex/pi-test/SKILL.md', 'config/agent.example.json', 'examples/retry-demo/task.json']) assert.ok(files.includes(file), `${file} is required by the installed runtime`);
  assert.ok(files.every((f) => !/^(?:video|artifacts|node_modules|tests|\.runtime|docs\/private)\//.test(f) && !/\.local\.|(^|\/)\.env/.test(f)));
});
