#!/usr/bin/env python3
"""Open/close only the explicitly configured MVP SSH forwards; never log secrets."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['start', 'stop', 'status'])
    parser.add_argument('--config', default=str(ROOT / 'docs/private/mvp-config.local.json'))
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())['ssh']
    socket = Path(config['control_socket'])
    destination = config['user'] + '@' + config['host']
    common = ['ssh', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15', '-S', str(socket), '-p', str(config['port'])]
    op = 'exit' if args.action == 'stop' else 'check'
    if args.action != 'start':
        r = subprocess.run(common + ['-O', op, destination], capture_output=True, timeout=20)
        print(json.dumps({'action': args.action, 'ok': r.returncode == 0}))
        return 0 if r.returncode == 0 else 1
    r = subprocess.run(common + ['-O', 'check', destination], capture_output=True, timeout=20)
    if r.returncode == 0:
        print(json.dumps({'action': 'start', 'ok': True, 'already_running': True}))
        return 0
    socket.parent.mkdir(parents=True, exist_ok=True)
    forwards = []
    for item in config['forwards']:
        local_port, remote_port = int(item['local_port']), int(item['remote_port'])
        if not (1 <= local_port <= 65535 and 1 <= remote_port <= 65535):
            raise ValueError('Invalid configured forward')
        forwards += ['-L', f'127.0.0.1:{local_port}:127.0.0.1:{remote_port}']
    env = dict(os.environ)
    # This helper reads a private local document at request time. No password is
    # copied into its contents, shell arguments, logs, or a normal config file.
    helper = socket.parent / 'mvp-askpass.local.py'
    if config.get('login_document'):
        helper.write_text("#!/usr/bin/env python3\nimport os,re\nfrom pathlib import Path\ns=Path(os.environ['MVP_LOGIN_DOCUMENT']).read_text()\nm=re.search(r'\\|[^|]*密码[^|]*\\|\\s*`([^`]+)`',s)\nif m: print(m.group(1))\n")
        helper.chmod(0o700)
        env.update(SSH_ASKPASS=str(helper.resolve()), SSH_ASKPASS_REQUIRE='force', DISPLAY=':0', MVP_LOGIN_DOCUMENT=config['login_document'])
    try:
        r = subprocess.run(common + ['-M', '-fNT', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=3'] + forwards + [destination], env=env, stdin=subprocess.DEVNULL, capture_output=True, timeout=35)
    finally:
        helper.unlink(missing_ok=True)
    print(json.dumps({'action': 'start', 'ok': r.returncode == 0}))
    return 0 if r.returncode == 0 else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired):
        print(json.dumps({'ok': False, 'error': 'Check private SSH configuration and known host credentials.'}))
        sys.exit(1)
