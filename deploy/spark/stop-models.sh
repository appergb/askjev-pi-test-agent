#!/usr/bin/env bash
set -euo pipefail

for session in agent-api-tunnel agent-api-proxy; do
  if tmux has-session -t "$session" 2>/dev/null; then
    tmux kill-session -t "$session"
  fi
done

if tmux has-session -t openjev-score 2>/dev/null; then
  tmux kill-session -t openjev-score
fi

if docker container inspect qwen38-agent >/dev/null 2>&1; then
  docker stop qwen38-agent >/dev/null
fi

printf 'Model services stopped. Cached weights were retained.\n'
