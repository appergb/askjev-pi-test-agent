---
name: browser-tests
description: Generate declarative browser test plans for a scoped static frontend snapshot, with real UI actions and requirement-grounded assertions.
---

Apply only when readProject.execution.type is browser. This replaces the node:test code format in writing-tests. Read HTML IDs, JavaScript behavior and the contract from approved task data.

Use the normal readProject -> askJEV -> writeTests -> runTests -> finishReport workflow. In writeTests, code is a JSON string representing {"schema_version":"1.0","steps":[...]}. Do not emit JavaScript, Markdown fences, imports, evaluate, shell commands, arbitrary URLs or network requests. The executor loads the task's HTML entry before each test in a fresh Chrome context with snapshot assets only. Each case starts from the initial page state.

A step is {"action":"fill","selector":"#quantity","value":"2"}, {"action":"click","selector":"#recalculate"}, or an assertion such as {"action":"text","selector":"#total","value":"45.00"}. Selectors are simple CSS rooted at an HTML element ID; use actual IDs from source. Allowed actions: click, fill, select (value is the option value), check, uncheck. Assertions: text (exact trimmed visible text), value (exact input string), count (integer), visible, hidden, enabled, disabled. Every case needs at least one assertion; maximum 30 steps. Boolean assertions do not need a value.

Prepare and save a plan for EVERY candidate so the same tests can be reused for a frozen comparison. runTests will execute ONLY the runtime's selected_ids. Never report skipped candidates as passed. Derive expected UI values from requirements, including formatting and the calculation order. Actions must trigger rendering; filling inputs alone may not update an app that recalculates on button click.

Actual mismatch returns assertion_failure with expected and actual values, steps and a screenshot. Bad selectors/action failures are test_error, not confirmed business defects. Explain each selected failure against its quoted requirement in finishReport. Do not infer bugs from low scores or test success from high scores.
