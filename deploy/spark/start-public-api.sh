#!/usr/bin/env bash
set -euo pipefail

runtime_root="${SPARK_RUNTIME_ROOT:-$HOME/workspaces/403-forbidden-runtime}"
bin_dir="$runtime_root/bin"
secrets_dir="$runtime_root/secrets"
official_api_key_file="$secrets_dir/agent-api-key-official"
user_api_key_file="$secrets_dir/agent-api-key-user"
proxy_session="agent-api-proxy"
tunnel_session="agent-api-tunnel"
proxy_port="31000"
cloudflared_version="2026.9.1"
cloudflared_sha256="3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3"
cloudflared_bin="$bin_dir/cloudflared"
tunnel_log="$runtime_root/public-api-tunnel.log"
public_url_file="$secrets_dir/agent-api-url"
python_bin="$runtime_root/openjev/.venv-spark/bin/python"

mkdir -p "$bin_dir" "$secrets_dir"
chmod 700 "$secrets_dir"

umask 077
for key_file in "$official_api_key_file" "$user_api_key_file"; do
  if [[ ! -s "$key_file" ]]; then
    openssl rand -hex 32 > "$key_file"
  fi
  chmod 600 "$key_file"
done

if cmp --silent "$official_api_key_file" "$user_api_key_file"; then
  openssl rand -hex 32 > "$user_api_key_file"
  chmod 600 "$user_api_key_file"
fi

if [[ ! -x "$cloudflared_bin" ]]; then
  download_path="$cloudflared_bin.download"
  curl --fail --location --silent --show-error \
    "https://github.com/cloudflare/cloudflared/releases/download/$cloudflared_version/cloudflared-linux-arm64" \
    --output "$download_path"
  printf '%s  %s\n' "$cloudflared_sha256" "$download_path" | sha256sum --check --status
  mv "$download_path" "$cloudflared_bin"
  chmod 700 "$cloudflared_bin"
fi

printf '%s  %s\n' "$cloudflared_sha256" "$cloudflared_bin" | sha256sum --check --status
test -f "$bin_dir/public_api_proxy.py"
test -x "$python_bin"
curl --fail --silent --show-error http://127.0.0.1:30000/v1/models >/dev/null

tmux kill-session -t "$tunnel_session" 2>/dev/null || true
tmux kill-session -t "$proxy_session" 2>/dev/null || true

tmux new-session -d -s "$proxy_session" \
  "AGENT_OFFICIAL_API_KEY_FILE='$official_api_key_file' AGENT_USER_API_KEY_FILE='$user_api_key_file' AGENT_CANONICAL_MODEL='TRIPFZ-Alpha-27b' AGENT_UPSTREAM_BASE='http://127.0.0.1:30000' AGENT_MAX_BODY_BYTES='33554432' AGENT_USER_RATE_LIMIT_PER_MINUTE='60' AGENT_OFFICIAL_CONCURRENCY='1' AGENT_OFFICIAL_QUEUE_SIZE='8' AGENT_USER_CONCURRENCY='7' AGENT_USER_QUEUE_SIZE='64' AGENT_UPSTREAM_TIMEOUT_SECONDS='900' '$python_bin' -m uvicorn public_api_proxy:app --app-dir '$bin_dir' --host 127.0.0.1 --port '$proxy_port' --no-access-log"

official_api_key="$(tr -d '\r\n' < "$official_api_key_file")"
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error \
    -H "Authorization: Bearer $official_api_key" \
    "http://127.0.0.1:$proxy_port/v1/models" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl --fail --silent --show-error \
  -H "Authorization: Bearer $official_api_key" \
  "http://127.0.0.1:$proxy_port/v1/models" >/dev/null
unset official_api_key

: > "$tunnel_log"
chmod 600 "$tunnel_log"
tmux new-session -d -s "$tunnel_session" \
  "'$cloudflared_bin' --config /dev/null --logfile '$tunnel_log' --loglevel info tunnel --no-autoupdate --url 'http://127.0.0.1:$proxy_port'"

public_url=""
for _ in $(seq 1 60); do
  public_url="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$tunnel_log" | tail -n 1 || true)"
  if [[ -n "$public_url" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$public_url" ]]; then
  echo "Public tunnel did not become ready" >&2
  exit 1
fi

umask 077
printf '%s\n' "$public_url" > "$public_url_file"
chmod 600 "$public_url_file"

printf 'Public API URL: %s/v1\n' "$public_url"
printf 'Official API key file: %s\n' "$official_api_key_file"
printf 'User API key file: %s\n' "$user_api_key_file"
