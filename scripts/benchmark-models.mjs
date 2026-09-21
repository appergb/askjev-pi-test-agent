import fs from 'node:fs/promises';
import { Type } from 'typebox';
import { loadConfig, modelRuntime } from '../src/model.mjs';
import { saveJSON, readJSON } from '../src/common.mjs';

const config = await loadConfig();
const labels = process.argv.slice(2).length ? process.argv.slice(2) : ['qwen-cloud', 'flash', 'glm'];
await fs.mkdir('artifacts/evaluation', { recursive: true });
const results = (await readJSON('artifacts/evaluation/model-benchmark.json').catch(() => [])).filter((r) => !labels.includes(r.label));
for (const label of labels) {
  const start = performance.now();
  let first = null;
  try {
    const { runtime, model } = await modelRuntime(config, label, `.runtime/benchmark-${label}`);
    const stream = runtime.streamSimple(model, {
      systemPrompt: 'You are a testing planner. Call submit exactly once with a concise executable test. Do not use prose or thinking. The source imports are one directory above the generated test.',
      messages: [{ role: 'user', content: "Contract: add(a,b) returns their sum. Source math.mjs: export function add(a,b) { return a-b; }. Call submit with case_id=addition, expected=5, and code for a node:test test importing ../math.mjs and asserting add(2,3) equals 5.", timestamp: Date.now() }],
      tools: [{ name: 'submit', description: 'Submit the requested test.', parameters: Type.Object({ case_id: Type.String(), expected: Type.Number(), code: Type.String() }) }],
    }, { maxTokens: 1024, temperature: 0, signal: AbortSignal.timeout(75000) });
    for await (const event of stream) if (first === null && ['text_delta', 'toolcall_delta'].includes(event.type)) first = performance.now() - start;
    const message = await stream.result();
    const tool = message.content.find((c) => c.type === 'toolCall');
    const valid = tool?.name === 'submit' && tool.arguments.case_id === 'addition' && tool.arguments.expected === 5 && typeof tool.arguments.code === 'string' && tool.arguments.code.includes('node:test');
    const result = { label, model: model.id, duration_ms: performance.now() - start, first_content_ms: first, valid_tool_call: valid, stop_reason: message.stopReason, usage: message.usage, ...(valid ? { code: tool.arguments.code } : { error: 'No valid requested tool call' }) };
    results.push(result);
    console.error(JSON.stringify({ label, duration_ms: result.duration_ms, valid_tool_call: valid, stop_reason: result.stop_reason }));
  } catch { results.push({ label, duration_ms: performance.now() - start, valid_tool_call: false, error: 'Model request failed' }); console.error(`${label}: request failed`); }
  await saveJSON('artifacts/evaluation/model-benchmark.json', results);
}
console.log(JSON.stringify(results.map(({ code, ...r }) => r), null, 2));
