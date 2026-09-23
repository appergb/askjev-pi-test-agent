# Sustained testing

Use the Skill wrapper with `campaign --request TASK --select all --rounds 3 --max-seconds 600 --max-model-turns 60`. This runs a finite sequence, snapshots approved files once, gives each round fresh model state, carries previous tested scenarios/unreferenced requirements as data, reproduces failures using unchanged tests, and writes a campaign handoff.

For asynchronous execution create a session, then `session campaign --id ID --request TASK --select all --rounds 3 --max-seconds 600 --max-model-turns 60`. Wait with inspect/logs until busy=false; read last_result. stop cancels; restart without a replacement request repeats the previous job type and limits. Do not submit duplicate jobs while waiting. Campaigns do not consume or replace the single-run conversation in that session.

Keep user-specified lowest/highest/range scopes. For full execution only, `--scoring-failure all` permits null-score fallback if the scoring service fails. Otherwise errors block, as before. Score saturation/tie diagnostics do not imply the ranking has been calibrated or fixed.

Campaign result and coding-handoff link individual round evidence and reproductions. Count unique reviewed root causes, not finding_records. Reproduced assertion failure still requires requirement/oracle review. If a round fails, times out or is cancelled, prior evidence remains but the campaign must not be called a complete pass.

To verify a fix, use regress/feedback with each relevant individual round directory, not the campaign summary directory. Stop reasons and original artifacts are retained. There is no crash/step resume, automatic source modification, monetary-cost cap, or recurring schedule. Do not infer any of those capabilities from background session execution.
