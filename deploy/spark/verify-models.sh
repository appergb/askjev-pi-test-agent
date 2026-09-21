#!/usr/bin/env bash
set -euo pipefail

printf 'Open JEV status:\n'
curl --fail --silent --show-error http://127.0.0.1:8766/status
printf '\nOpen JEV report:\n'
curl --fail --silent --show-error http://127.0.0.1:8766/report
printf '\nOpen JEV decision:\n'
curl --fail --silent --show-error \
  http://127.0.0.1:8766/decide \
  -H 'Content-Type: application/json' \
  -d '{"state":"The parcel will arrive on Thursday. Do not call the recipient.","questions":[{"id":"arrival","type":"choice","question":"When will the parcel arrive?","options":[{"id":"tue","description":"Tuesday"},{"id":"thu","description":"Thursday"}]}]}'

printf '\nSGLang models:\n'
curl --fail --silent --show-error http://127.0.0.1:30000/v1/models
printf '\nSGLang chat:\n'
curl --fail --silent --show-error \
  http://127.0.0.1:30000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"TRIPFZ-Alpha-27b","messages":[{"role":"user","content":"Reply with exactly: READY"}],"temperature":0,"max_tokens":32,"chat_template_kwargs":{"enable_thinking":false}}'
printf '\n'
