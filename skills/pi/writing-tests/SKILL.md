---
name: writing-tests
description: Write executable node:test cases for prepared inspection items and run them through the Pi runtime's restricted test executor.
---

Use after askJEV. Input includes source, requirements, cases and priority order. Output is one self-contained .test.mjs file per case through writeTests, followed by actual runTests evidence.

Use only `node:test`, `node:assert/strict`, and relative imports of approved JavaScript business files. Preserve the actual source extension (.js, .mjs or .cjs); do not rename or reimplement source. Test files live under tests/, so a root source import is `../store.mjs` and a nested source can be `../src/index.js`. Each test title must contain its case_id. Await asynchronous behavior and use independent fixtures. Do not mark tests skip/todo or swallow failures.

Put explicit requirements into assertions. For valid inputs which must not throw, use assert.doesNotThrow so unexpected exceptions become clear assertion failures. For expected rejection, use assert.throws with the specified error type. Never loosen an assertion or change source code to make a result pass.

`assert.doesNotThrow` itself returns undefined. If checking the returned task, assign it inside the callback: `let task; assert.doesNotThrow(() => { task = store.create(input); });` and then assert on task. Do not assign the return value of assert.doesNotThrow to a business result.

Submit all prepared cases in one writeTests call, then call runTests; the executor runs the ordered batch. When the result is test_error, inspect the cause and repair only syntax/import/setup mistakes within the attempt budget. Assertion failures are preserved for report analysis; do not rewrite them. Network, shell commands, dependency installation and arbitrary filesystem operations are unavailable.

Example: test a repeated task creation by calling create twice, then asserting list().length equals one and comparing the returned data. Use the API contract for expected values.
