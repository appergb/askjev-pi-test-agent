import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { check, plainFile, readJSON } from './common.mjs';

// Browser executor: runs a declared browser-plan-v1 document against approved
// static assets in a fresh headless Chrome context. Boundary: only
// http://askjev.local GET requests served from the approved asset map ever
// reach the page; every outcome — including setup failure — becomes a
// structured execution record, never a thrown error.

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const actions = ['click', 'fill', 'select', 'check', 'uncheck', 'text', 'value', 'count', 'visible', 'hidden', 'enabled', 'disabled'];
const assertions = ['text', 'value', 'count', 'visible', 'hidden', 'enabled', 'disabled'];
/**
 * Validate a browser-plan-v1 document before it may execute. Rejects unknown
 * fields, selectors not rooted at an element ID, missing assertions, and
 * more than 30 steps.
 * @param {unknown} plan Parsed JSON plan submitted by the agent.
 * @returns {object} The same plan (validated in place; no normalization).
 * @throws {Error} Model-facing message naming the first violated rule.
 */
export function validateBrowserPlan(plan) {
  check(plan?.schema_version === '1.0' && Array.isArray(plan.steps) && plan.steps.length > 0 && plan.steps.length <= 30, 'Invalid browser plan');
  check(Object.keys(plan).every((k) => ['schema_version', 'steps'].includes(k)), 'Unexpected browser plan field');
  for (const s of plan.steps) {
    check(actions.includes(s.action) && typeof s.selector === 'string' && /^#[a-zA-Z][\w-]*(?:[ >.#\[\]="'\w-]*)$/.test(s.selector) && s.selector.length <= 160, 'Use a simple CSS selector rooted at a page element ID');
    check(Object.keys(s).every((k) => ['action', 'selector', 'value'].includes(k)), 'Unexpected browser step field');
    if (['fill', 'select', 'text', 'value'].includes(s.action)) check(typeof s.value === 'string' && s.value.length <= 1000, 'Step requires a string value');
    if (s.action === 'count') check(Number.isInteger(s.value) && s.value >= 0 && s.value <= 1000, 'Count requires a nonnegative integer');
  }
  check(plan.steps.some((s) => assertions.includes(s.action)), 'Browser plan requires an assertion');
  return plan;
}

/**
 * Execute one browser plan end-to-end and classify the result, mirroring the
 * node:test record shape. The page is served from an in-memory asset map on a
 * fixed fake origin with a strict CSP; external requests, WebSockets and
 * service workers are blocked. A failure screenshot is kept when possible.
 * @param {string} workspace Workspace root holding approved assets and the plan.
 * @param {string} testFile Relative plan path inside workspace.
 * @param {object} [options] { execution, signal?, timeout?=15000, screenshot? }
 * @returns {Promise<object>} Structured execution record (never throws).
 */
export async function executeBrowser(workspace, testFile, { execution, signal, timeout = 15000, screenshot } = {}) {
  const start = performance.now();
  const started_at = new Date().toISOString();
  let browser, context, timer, stop_reason = null, assertion_failure = false, classification = 'environment_error', screenshot_file;
  const logs = [], steps = [];
  let assertionCount = 0, assertionPass = 0;
  const stop = () => { stop_reason = signal?.aborted ? 'cancelled' : 'timeout'; void browser?.close().catch(() => {}); };
  try {
    const plan = validateBrowserPlan(await readJSON(await plainFile(workspace, testFile)));
    check(!signal?.aborted, 'Browser run cancelled');
    const assets = new Map();
    for (const file of execution.assets) assets.set('/' + file, await fs.readFile(await plainFile(workspace, file)));
    // Chrome's own browser sandbox on top of ours; scrubbed env so host state
    // cannot leak into the page process.
    browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true, timeout: 15000, env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: os.tmpdir(), TMPDIR: os.tmpdir(), LANG: 'en_US.UTF-8' } });
    signal?.addEventListener('abort', stop, { once: true });
    timer = setTimeout(stop, timeout);
    if (signal?.aborted) { stop(); throw new Error('Cancelled'); }
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
    await context.routeWebSocket('**/*', (ws) => ws.close());
    // Single origin + GET + asset-map allowlist; everything else aborts. The
    // strict CSP on every fulfilled response additionally disables connect,
    // frames, workers, forms and base-uri hijacking for page-initiated requests.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      const body = assets.get(url.pathname);
      if (url.origin !== 'http://askjev.local' || route.request().method() !== 'GET' || !body) return route.abort('blockedbyclient');
      await route.fulfill({ body, contentType: types[path.extname(url.pathname)] || 'text/plain', headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(2500);
    page.on('dialog', (dialog) => void dialog.dismiss());
    let pageError = false;
    // Page-level JS errors are recorded here and downgrade a would-be pass below:
    // page health is part of the result, not just the assertion outcome.
    page.on('pageerror', () => { pageError = true; });
    await page.goto('http://askjev.local/' + execution.entry, { waitUntil: 'load', timeout: 8000 });
    classification = 'test_error';
    for (const [index, step] of plan.steps.entries()) {
      const target = page.locator(step.selector);
      let actual;
      try {
        if (step.action === 'click') await target.click();
        else if (step.action === 'fill') await target.fill(step.value);
        else if (step.action === 'select') await target.selectOption(step.value);
        else if (step.action === 'check') await target.check();
        else if (step.action === 'uncheck') await target.uncheck();
        else {
          assertionCount++;
          if (step.action === 'text') actual = (await target.innerText()).trim();
          else if (step.action === 'value') actual = await target.inputValue();
          else if (step.action === 'count') actual = await target.count();
          else if (step.action === 'visible' || step.action === 'hidden') actual = await target.isVisible();
          else actual = await target.isEnabled();
          const expected = ['text', 'value', 'count'].includes(step.action) ? step.value : ['visible', 'enabled'].includes(step.action);
          assert.deepEqual(actual, expected, `Browser assertion ${step.selector} ${step.action}`);
          assertionPass++;
        }
        steps.push({ index, ...step, status: 'passed', ...(actual !== undefined ? { actual } : {}) });
      } catch (error) {
        assertion_failure = error.code === 'ERR_ASSERTION';
        classification = assertion_failure ? 'assertion_failure' : 'test_error';
        steps.push({ index, ...step, status: classification, ...(actual !== undefined ? { actual } : {}) });
        logs.push(assertion_failure ? `ERR_ASSERTION ${step.selector}: expected ${JSON.stringify(error.expected)}, actual ${JSON.stringify(error.actual)}` : 'Browser action or selector failed; review test setup.');
        break;
      }
    }
    if (steps.length === plan.steps.length && steps.every((s) => s.status === 'passed') && assertionPass > 0) classification = 'passed';
    if (pageError) { logs.push('Page JavaScript error observed; requires review.'); if (classification === 'passed') classification = 'test_error'; }
    if (screenshot && !stop_reason) { await page.screenshot({ path: screenshot, fullPage: true, timeout: 3000 }); screenshot_file = path.basename(screenshot); }
  } catch { logs.push('Browser setup or execution interrupted; check Chrome, fixture files and plan.'); }
  // Deliberate bare catch above: any setup or interruption failure must still
  // produce a structured environment_error record — the same no-throw policy
  // as campaign and session state (no exception text ever reaches artifacts).
  finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); await browser?.close().catch(() => {}); }
  if (stop_reason) classification = 'environment_error';
  return { classification, assertion_failure: assertion_failure && classification === 'assertion_failure', exit_code: classification === 'passed' ? 0 : 1, stdout: logs.join('\n') || 'Browser assertions passed.', stderr: '', stop_reason, started_at, duration_ms: performance.now() - start, counts: { tests: 1, pass: classification === 'passed' ? 1 : 0, fail: classification === 'passed' ? 0 : 1, skipped: 0, cancelled: stop_reason === 'cancelled' ? 1 : 0 }, assertions: { total: assertionCount, passed: assertionPass }, steps, screenshot: screenshot_file, framework: 'browser-plan-v1', sandbox: 'fresh-chrome-context-static-snapshot-v1', command: ['askjev', 'replay', '--from', '<run-directory>'] };
}
