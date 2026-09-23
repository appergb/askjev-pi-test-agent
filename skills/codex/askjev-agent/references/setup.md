# Setup

Extract the standalone askjev-agent-skill archive. Run `node askjev-agent/scripts/install.mjs`; optional `--skills-dir <directory>` chooses another host's skill discovery directory and `--prefix <empty-or-managed-directory>` chooses the CLI installation directory.

Default skill registration: `$CODEX_HOME/skills/askjev-agent`, or `~/.codex/skills/askjev-agent`. Default private CLI: `~/.local/share/askjev-agent/<version>`. Installation does not change shell profiles or replace an existing global pi/askjev installation. Use this skill's `scripts/askjev.mjs` wrapper or receipt.commands absolute paths. Skill metadata uses normal implicit invocation; if a host does not discover it yet, refresh the host's skill list.

For the human-facing terminal use `receipt.commands["askjev-cli"]`. It opens an askJEV-branded conversation and runs existing task files with `/run <task.json>`. The terminal uses the configured default model and offers no model chooser. When the user requests a shell command, link that installed entry into an existing writable PATH directory without overwriting unrelated commands. Script automation continues to use the wrapper and JSON CLI.

The standalone archive contains assets/runtime.tgz and assets/runtime.json (SHA-256 and version). A source-only skill checkout must be packaged by the project's `scripts/build-skill-package.mjs` first; no unpinned latest download is substituted. Installing requires network access for npm dependencies. The archive includes neither Node nor Chrome nor private credentials; install those separately only if authorized and needed.

Then use the wrapper:

```text
init                                    # creates private config without overwriting
models                                  # lists configured model aliases
connect start                           # only if private config defines an SSH tunnel
doctor --probe --model flash-direct      # checks a real generation tool call
doctor --browser                        # additionally checks Chrome for frontend tests
```

Existing config can be imported with `init --import-config <private-file>` into a fresh destination, or referenced with --config. The original API keys remain in environment variables or explicitly referenced auth files. Don't copy keys into task JSON or model prompts. Cloud SSH config and credentials are not distributed in the bundle.
