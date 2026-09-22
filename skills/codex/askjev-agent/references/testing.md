# Task and testing workflow

Use task schema_version 1.0. project is an absolute path; files explicitly list approved relative source and requirement files, requirement_file must be one of them. At least one .js/.mjs/.cjs is required. objective states the contract to inspect. budget includes max_duration_seconds (10..1800), max_cases (1..12), max_model_turns (1..40), max_test_attempts (1..3); optional min_cases prevents scope collapse. Model context is limited to 16 KB, snapshots to 512 KB. No hidden paths, credentials, traversal or symlinks.

For static frontend tasks add execution={"type":"browser","entry":"index.html","assets":["index.html","app.js","styles.css"]}; all assets must be in files. Chrome executes approved static assets in a fresh browser context. This is not live-site, login, API, payment or visual-diff testing. Node modules use the macOS restricted executor. Baseline node-test/uvu suites must be explicitly configured.

Run in a session, or use `run --request <task>` for a one-shot session. `--select lowest --count 3`, `highest --count 3`, `range --min-score 0 --max-score 0.5`, and `all` select cases. Unknown scores are not zero. Same-score ties use case ID, not inferred risk. Configured original baselines still run; excluded generated cases remain untested.

Business CLI stdout is JSON; progress is stderr. Exit codes: 0 success without confirmed findings; 1 completed with findings; 2 input/config invalid; 3 failed; 4 incomplete/inconclusive; 5 cancelled. Session lifecycle commands return management status, not a test verdict. Always inspect result.run_status, assessment, selection, skipped cases and actual evidence.

```text
handoff --from <run-directory>
regress --from <run-directory> --project <fixed-checkout>
feedback --from <run-directory> --regression <regression-directory>
```

regress executes all saved original plans, including initially unselected ones, with new source and fresh baseline. `replay --from <run> --select all` instead compares the frozen original source using the original scores/tests; do not use replay as proof that a code fix works. Merge equivalent failing cases into root causes before stating a bug count.
