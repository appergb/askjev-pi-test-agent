import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ROOT } from './common.mjs';

export const appHome = () => path.resolve(process.env.ASKJEV_HOME || path.join(os.homedir(), '.askjev-agent'));
export const runsHome = () => path.join(appHome(), 'runs');
export async function configPath(explicit) {
  if (explicit || process.env.ASKJEV_CONFIG || process.env.PI_TEST_CONFIG) return path.resolve(explicit || process.env.ASKJEV_CONFIG || process.env.PI_TEST_CONFIG);
  const preferred = path.join(appHome(), 'config.json');
  try { await fs.access(preferred); return preferred; } catch {}
  const legacy = path.join(ROOT, 'docs/private/mvp-config.local.json');
  try { await fs.access(legacy); return legacy; } catch {}
  return preferred;
}
