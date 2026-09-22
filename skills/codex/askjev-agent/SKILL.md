---
name: askjev-agent
description: Install and invoke the packaged askJEV testing CLI, manage independent persistent test-agent sessions, inspect reproducible bug evidence, and verify coding-agent fixes. Use for askJEV installation, delegated project testing, score-based frontend tests, or session lifecycle management; not ordinary implementation without a testing request.
---

You are the coding agent; askJEV Agent generates and executes business tests. Use the bundled CLI rather than writing replacement tests yourself. When installation is requested, run `node <this-skill-directory>/scripts/install.mjs`. It verifies and installs the bundled runtime, all approved runtime Skills, and the askjev / askJEV / pi-test-agent command aliases. Dependencies come from the locked package; Node.js >=22.19 must already be present. Do not claim that copying SKILL.md itself executed an installer.

For every CLI call prefer `node <this-skill-directory>/scripts/askjev.mjs <arguments>`. This wrapper uses the matching private installation and bootstraps it if absent. Do not assume a globally installed askjev is the matching version. Initialization preserves existing configuration. Reuse an explicitly configured private config or call init to create a template; credentials and DGX Spark connection details must be supplied locally, never invented or copied into the skill. Read [setup](references/setup.md) for the concrete installation and configuration sequence. A host without local files and terminal tools cannot run this skill's installer.

Before testing, choose the approved source/requirement files, model, budget and execution profile. The scoped task schema and command sequence are in [testing](references/testing.md). Read that reference when creating a task or interpreting an incomplete result. Run doctor, adding --browser for static frontend tests and --probe for a real model connection check. Connect start establishes an existing configured SSH tunnel, not a cloud deployment.

Choose session lifecycle intentionally:
- Create a fresh session for a new project, unrelated hypothesis, independent evaluation, or a task that must not inherit previous context.
- Continue an idle session on the same project when prior discussion is useful. Every run still snapshots current code, rereads requirements and computes fresh scores.
- Clear an idle session when old context is misleading, too large, or no longer needed. Clear discards conversation state, but preserves evidence.
- Stop an active session to cancel its work. Inspect until it is no longer busy; do not treat a cancellation request as completion.
- Restart to stop, clear context, and rerun the last submitted task (or an explicit replacement task). This incurs new model/test work.
- Create multiple named sessions when independent test scopes warrant concurrency. Start only the number needed by the user's budget and provider capacity; same-session overlapping runs are rejected. Read [sessions](references/sessions.md) for commands and the distinction from Docker.

session run is asynchronous. Retain session ID and job ID, inspect and read logs until the task completes. If the host returns control before completion, keep following the same job rather than starting a duplicate. Read last_result, report and cited actual execution evidence. Failure/incomplete/cancelled are not clean passes. Numeric selection leaves excluded cases untested; low support scores are not user behavior probabilities and high scores do not establish correctness.

Consume handoff before changing business code. Verify the requirement and actual assertion. Fix business implementation, then regress on the fixed checkout with byte-identical saved tests and record feedback. Only claim a successful loop if the generated tests and configured baseline pass. Do not automatically publish issues, PRs, or messages. Do not install or modify cloud services as part of local installation.
