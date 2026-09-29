import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ROOT } from './common.mjs';

// Path resolution for every persisted artifact: the application home
// (ASKJEV_HOME, default ~/.askjev-agent), the runs output root, and the
// private config file resolved through the documented precedence chain
// --config > ASKJEV_CONFIG > PI_TEST_CONFIG (legacy) > home config.json
// > legacy in-checkout config. Other modules must derive locations from
// these helpers instead of hardcoding roots.

/**
 * Application home directory: root for runs, sessions and the default config.
 * ASKJEV_HOME redirects all state so installs and tests stay isolated.
 * @returns {string} Absolute path to the application home.
 */
export const appHome = () => path.resolve(process.env.ASKJEV_HOME || path.join(os.homedir(), '.askjev-agent'));
/**
 * Output root for test runs.
 * @returns {string} Absolute path to the runs directory.
 */
export const runsHome = () => path.join(appHome(), 'runs');
/**
 * Resolve the private config file to load, following the documented
 * precedence chain: explicit --config, then ASKJEV_CONFIG, then legacy
 * PI_TEST_CONFIG, then <appHome>/config.json, then the legacy in-checkout
 * config, then the home path again as the default (possibly missing).
 * @param {string|undefined} explicit Explicit config path from --config.
 * @returns {Promise<string>} Absolute path of the config file to load.
 */
export async function configPath(explicit) {
  if (explicit || process.env.ASKJEV_CONFIG || process.env.PI_TEST_CONFIG) return path.resolve(explicit || process.env.ASKJEV_CONFIG || process.env.PI_TEST_CONFIG);
  const preferred = path.join(appHome(), 'config.json');
  // Empty catches only probe existence; a missing file falls through to the next source.
  try { await fs.access(preferred); return preferred; } catch {}
  // Kept for pre-1.2 development checkouts: this path lives under the
  // gitignored docs/private/ area and never ships in the package.
  const legacy = path.join(ROOT, 'docs/private/mvp-config.local.json');
  try { await fs.access(legacy); return legacy; } catch {}
  return preferred;
}
