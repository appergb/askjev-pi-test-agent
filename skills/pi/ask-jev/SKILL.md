---
name: ask-jev
description: Prepare source-grounded inspection items and call askJEV in the Pi testing runtime to obtain experimental test-priority signals.
---

Use after readProject and before writing tests. Input is the task objective, exact source text and requirements. Output is a prepared summary and inspection items passed to the actual `askJEV` tool.

Each item needs a unique case_id, concrete scenario, expected behavior, a requirement_id selected from readProject.requirement_refs, a source file name from allowed_source_refs, and baseline=true for essential normal behavior. The runtime resolves the ID to an exact source quote. Legacy requirement_ref quotes are accepted, but prefer IDs to avoid Markdown formatting errors. Derive expectations from requirements, not from the current implementation. Respect both min_cases and max_cases. Combine equivalent checks when needed, but do not shrink a broad task to one easy case after validation errors.

Call askJEV once with the entire prepared batch. The runtime attaches approved source text and snapshot IDs. It does not do your semantic analysis. Do not invent endpoint URLs, credentials, backend results or scores.

The fixed profile compares supported, violated and unknown. The supported candidate's conditional probability is an uncalibrated ordering signal. It is not a measured failure rate. Unknown or invalid responses have no numerical score. Use the tool's returned priority order; baseline items remain mandatory. In MVP all prepared items are tested even if they score highly. If scoring fails, report the error; do not fabricate a zero or quietly substitute your own scores.

Example: for an idempotency requirement, prepare a scenario with two identical create calls and an expected single stored record. Quote the idempotency requirement and reference the source file. A low supported score motivates testing; only the actual test can establish failure.
