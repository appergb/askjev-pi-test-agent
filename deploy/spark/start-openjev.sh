#!/usr/bin/env bash
set -euo pipefail

runtime_root="${SPARK_RUNTIME_ROOT:-$HOME/workspaces/403-forbidden-runtime}"
repo="$runtime_root/openjev"
log_file="$runtime_root/logs/openjev.log"
session_name="openjev-score"

test -x "$repo/.venv-spark/bin/python"
test -f "$repo/data/instruction-4b-assets.json"
mkdir -p "$runtime_root/logs"

if tmux has-session -t "$session_name" 2>/dev/null; then
  tmux kill-session -t "$session_name"
fi

tmux new-session -d -s "$session_name" \
  "cd '$repo' && exec env DECISION_BACKEND=instruction DECISION_DEVICE=cuda DECISION_DTYPE=bfloat16 DECISION_ASSETS=data/instruction-4b-assets.json '$repo/.venv-spark/bin/python' -m uvicorn decisionmaking.server:app --host 127.0.0.1 --port 8766 > '$log_file' 2>&1"

printf 'Open JEV started in tmux session %s\n' "$session_name"
printf 'Log: %s\n' "$log_file"
