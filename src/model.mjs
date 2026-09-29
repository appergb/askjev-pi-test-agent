import path from 'node:path';
import fs from 'node:fs/promises';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime, DefaultResourceLoader, SessionManager, SettingsManager, createAgentSession } from '@earendil-works/pi-coding-agent';
import { readJSON, check } from './common.mjs';

import { configPath } from './paths.mjs';

// Private-configuration loading, model registration and Pi session assembly.
// Credentials are resolved here but never logged and never written to disk:
// keys live in an in-memory credential store only, and provider/transport
// error text is kept out of user-facing messages downstream.

/**
 * Load and structurally validate the private config: require a models map
 * and a scoring.baseUrl, and resolve relative auth_file entries against the
 * config file's own directory.
 * @param {string|undefined} file Explicit config path (from --config).
 * @returns {Promise<object>} The parsed config object.
 * @throws {Error} When required fields are missing or malformed.
 */
export async function loadConfig(file) {
  const resolved = await configPath(file);
  const config = await readJSON(resolved);
  for (const entry of Object.values(config.models ?? {})) if (entry.auth_file && !path.isAbsolute(entry.auth_file)) entry.auth_file = path.resolve(path.dirname(resolved), entry.auth_file);
  check(config.models && typeof config.scoring?.baseUrl === 'string', 'Invalid private model configuration');
  return config;
}

/**
 * Build a Pi ModelRuntime for one configured model alias: register the
 * model under a private provider, resolve its API key from an environment
 * variable or auth file (never persisted), and return the runtime handle.
 * @param {object} config Parsed private config.
 * @param {string} label Model alias to activate.
 * @param {string} runtimeDir Directory for the model catalog (0o700).
 * @param {Function} [beforeRequest] Callback invoked before each model request.
 * @returns {Promise<object>} { runtime, model }
 * @throws {Error} On unconfigured alias, non-HTTPS endpoint or missing key.
 */
export async function modelRuntime(config, label, runtimeDir, beforeRequest) {
  const entry = config.models[label];
  check(entry?.definition, 'Model alias is not configured');
  const definition = { ...entry.definition, maxTokens: Math.min(entry.definition.maxTokens ?? 4096, 4096) };
  const base = new URL(definition.baseUrl);
  // Endpoints must be HTTPS, or plain HTTP only on the loopback interface
  // (SSH-tunneled services terminate TLS elsewhere).
  check(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)), 'Model requires HTTPS or a local tunnel');
  let key = entry.api_key_env ? process.env[entry.api_key_env] : undefined;
  if (entry.auth_file) {
    const auth = await readJSON(entry.auth_file);
    check(auth[entry.auth_provider]?.type === 'api_key', 'MVP requires an API-key credential');
    key = auth[entry.auth_provider].key;
  }
  // Tunnel providers authenticate at the SSH layer, not the API layer; the
  // placeholder satisfies the SDK's non-empty key requirement for loopback HTTP.
  if (!key && base.protocol === 'http:') key = 'local-tunnel';
  check(typeof key === 'string' && key.length > 0, 'Model API key is unavailable');
  await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: path.join(runtimeDir, 'catalog.json'), allowModelNetwork: false, refreshOnCreate: false });
  runtime.registerProvider('mvp', { api: definition.api, baseUrl: definition.baseUrl, authHeader: true, models: [definition] });
  await runtime.setRuntimeApiKey('mvp', key);
  const model = runtime.getModel('mvp', definition.id);
  check(model, 'Model registration failed');
  // The subtlest code in the repo: wrap streamSimple so every model request
  // is deterministic (maxTokens capped at 4096, temperature 0) and optional
  // chat_template_kwargs are injected into the outgoing payload via onPayload
  // (chaining any caller-provided onPayload after ours). The original bound
  // method is kept in `stream`; only this wrapper is ever called afterwards.
  const stream = runtime.streamSimple.bind(runtime);
  runtime.streamSimple = (m, context, options) => {
    beforeRequest?.();
    return stream(m, context, { ...options, maxTokens: 4096, temperature: 0,
    ...(entry.chat_template_kwargs ? { onPayload: async (payload, resolvedModel) => ({ ...((await options?.onPayload?.(payload, resolvedModel)) ?? payload), chat_template_kwargs: entry.chat_template_kwargs }) } : {}),
    });
  };
  return { runtime, model };
}

/**
 * Assemble a complete Pi agent session for one run: model runtime, strict
 * in-memory settings, a resource loader that disables the user's own
 * extensions/skills/templates, custom tools, and the run's system prompt.
 * Optionally resumes a persistent conversation via a validated pointer file.
 * @param {object} options { config, label, cwd, tools, systemPrompt,
 *   runtimeDir, conversation?, beforeModelRequest? }
 * @returns {Promise<object>} { session, model, conversation_resumed }
 * @throws {Error} On configuration or session-pointer violations.
 */
export async function createPi({ config, label, cwd, tools, systemPrompt, runtimeDir, conversation, beforeModelRequest }) {
  const { runtime, model } = await modelRuntime(config, label, runtimeDir, beforeModelRequest);
  // Deterministic single-attempt runs: no hidden compaction or SDK-level
  // retries; budget and cancellation are enforced by the caller instead.
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, transport: 'sse' });
  const loader = new DefaultResourceLoader({ cwd, agentDir: runtimeDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPromptOverride: () => systemPrompt, appendSystemPromptOverride: () => [],
  });
  await loader.reload();
  let sessionManager = SessionManager.inMemory(cwd);
  let resumed = false;
  if (conversation) {
    const directory = conversation.directory;
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const pointer = await readJSON(path.join(directory, 'current.json')).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
    // The session pointer is untrusted: it must be a bare *.jsonl basename,
    // the target must not be a symlink, and oversized contexts are refused
    // rather than silently resumed.
    if (pointer) {
      check(typeof pointer.file === 'string' && path.basename(pointer.file) === pointer.file && pointer.file.endsWith('.jsonl'), 'Invalid saved session pointer');
      const file = path.join(directory, pointer.file);
      const stat = await fs.lstat(file).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
      if (stat) {
        check(!stat.isSymbolicLink() && stat.size <= 2000000, 'Session context is invalid or too large; clear it');
        sessionManager = SessionManager.open(file, directory, cwd);
        resumed = true;
      } else sessionManager = SessionManager.create(cwd, directory);
    } else sessionManager = SessionManager.create(cwd, directory);
    await fs.writeFile(path.join(directory, 'current.json'), JSON.stringify({ file: path.basename(sessionManager.getSessionFile()) }), { mode: 0o600 });
  }
  const { session } = await createAgentSession({ cwd, agentDir: runtimeDir, modelRuntime: runtime, model, thinkingLevel: 'off',
    tools: tools.map((tool) => tool.name), customTools: tools, resourceLoader: loader,
    sessionManager, settingsManager });
  return { session, model, conversation_resumed: resumed };
}
