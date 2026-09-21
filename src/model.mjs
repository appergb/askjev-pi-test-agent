import path from 'node:path';
import fs from 'node:fs/promises';
import { InMemoryCredentialStore } from '@earendil-works/pi-ai';
import { ModelRuntime, DefaultResourceLoader, SessionManager, SettingsManager, createAgentSession } from '@earendil-works/pi-coding-agent';
import { ROOT, readJSON, check } from './common.mjs';

export async function loadConfig(file = process.env.PI_TEST_CONFIG || path.join(ROOT, 'docs/private/mvp-config.local.json')) {
  const config = await readJSON(file);
  check(config.models && typeof config.scoring?.baseUrl === 'string', 'Invalid private model configuration');
  return config;
}

export async function modelRuntime(config, label, runtimeDir) {
  const entry = config.models[label];
  check(entry?.definition, 'Model alias is not configured');
  const definition = { ...entry.definition, maxTokens: Math.min(entry.definition.maxTokens ?? 4096, 4096) };
  const base = new URL(definition.baseUrl);
  check(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)), 'Model requires HTTPS or a local tunnel');
  let key = entry.api_key_env ? process.env[entry.api_key_env] : undefined;
  if (entry.auth_file) {
    const auth = await readJSON(entry.auth_file);
    check(auth[entry.auth_provider]?.type === 'api_key', 'MVP requires an API-key credential');
    key = auth[entry.auth_provider].key;
  }
  if (!key && base.protocol === 'http:') key = 'local-tunnel';
  check(typeof key === 'string' && key.length > 0, 'Model API key is unavailable');
  await fs.mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, modelsStorePath: path.join(runtimeDir, 'catalog.json'), allowModelNetwork: false, refreshOnCreate: false });
  runtime.registerProvider('mvp', { api: definition.api, baseUrl: definition.baseUrl, authHeader: true, models: [definition] });
  await runtime.setRuntimeApiKey('mvp', key);
  const model = runtime.getModel('mvp', definition.id);
  check(model, 'Model registration failed');
  const stream = runtime.streamSimple.bind(runtime);
  runtime.streamSimple = (m, context, options) => stream(m, context, { ...options, maxTokens: 4096, temperature: 0,
    ...(entry.chat_template_kwargs ? { onPayload: async (payload, resolvedModel) => ({ ...((await options?.onPayload?.(payload, resolvedModel)) ?? payload), chat_template_kwargs: entry.chat_template_kwargs }) } : {}),
  });
  return { runtime, model };
}

export async function createPi({ config, label, cwd, tools, systemPrompt, runtimeDir }) {
  const { runtime, model } = await modelRuntime(config, label, runtimeDir);
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, transport: 'sse' });
  const loader = new DefaultResourceLoader({ cwd, agentDir: runtimeDir, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPromptOverride: () => systemPrompt, appendSystemPromptOverride: () => [],
  });
  await loader.reload();
  const { session } = await createAgentSession({ cwd, agentDir: runtimeDir, modelRuntime: runtime, model, thinkingLevel: 'off',
    tools: tools.map((tool) => tool.name), customTools: tools, resourceLoader: loader,
    sessionManager: SessionManager.inMemory(cwd), settingsManager });
  return { session, model };
}
