# Independent test sessions

Use the wrapper from SKILL.md before each command below.

```text
session create --name checkout --count 2
session list
session run --id <id> --request <absolute-task.json> --config <private-config>
session inspect --id <id>
session logs --id <id>
session stop --id <id>
session clear --id <id>
session restart --id <id>
```

create returns sessions[].id; run starts a detached worker and returns immediately with a job ID. inspect returns busy, status, generation, context_present, last_result and runs_directory. logs returns bounded progress events, without model text or credentials. Use modest polling intervals, and report only meaningful changes. Once busy is false, read last_result if present. Same-session concurrent run is rejected; different sessions can run independently.

stop requests cooperative cancellation via a private control file, never arbitrary PID termination. clear refuses a live worker. restart waits up to 10 seconds for cancellation, clears the context, and submits the last task again; if still busy, it fails without discarding active context. Pass --request for a replacement task. An interrupted dead worker can be recovered with clear. A stuck live worker is not forcibly killed by these commands.

Sessions bind to the real project path on first run. Use a new session for another project. Each session has a separate persistent SDK conversation, lock and evidence directory under ASKJEV_HOME/sessions/<id>. Clearing changes the generation and deletes conversation files, but leaves prior reports, tests, snapshots and the last submitted task for review/restart. It does not erase all sensitive source evidence; use the explicit retention policy for that separately.

This resembles a container lifecycle only at the application level. It is not Docker, OS isolation, CPU/memory quotas, a snapshot of a running process or a distributed queue. Existing Node/Chrome execution restrictions still apply. stop/continue does not resume a half-completed test step: run starts a new testing workflow with historical conversation. A very long or interrupted conversation may need clear; automatic compaction is disabled.
