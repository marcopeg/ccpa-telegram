# Configuration

HAL is configured via `hal.config.json` (and optional `hal.config.local.json`) in the directory where you run the CLI. This section is the index for all configuration options; detailed subsections are split into focused docs.

## Config files

### hal.config.json

Create a `hal.config.json` in your workspace directory (where you run the CLI from). Secrets like bot tokens should be kept out of this file — use `${VAR_NAME}` placeholders and store the values in `.env.local` or the shell environment instead.

```json
{
  "globals": {
    "engine": { "name": "claude" },
    "logging": { "level": "info", "flow": true, "persist": false },
    "rateLimit": { "max": 10, "windowMs": 60000 },
    "access": { "allowedUserIds": [] }
  },
  "projects": [
    {
      "name": "backend",
      "cwd": "./backend",
      "telegram": { "botToken": "${BACKEND_BOT_TOKEN}" },
      "access": { "allowedUserIds": [123456789] },
      "logging": { "persist": true }
    },
    {
      "name": "frontend",
      "cwd": "./frontend",
      "engine": { "name": "copilot", "model": "gpt-5-mini" },
      "telegram": { "botToken": "${FRONTEND_BOT_TOKEN}" },
      "access": { "allowedUserIds": [123456789] }
    }
  ]
}
```

### hal.config.local.json

An optional `hal.config.local.json` placed next to `hal.config.json` is deep-merged on top of the base config at boot time. It is gitignored and is the recommended place for machine-specific values or secrets that you don't want committed.

Every field is optional. Project entries are matched to base projects by `name` (preferred) or `cwd` — they cannot introduce new projects.

```json
{
  "projects": [
    {
      "name": "backend",
      "telegram": { "botToken": "7123456789:AAHActual-token-here" },
      "logging": { "persist": true }
    }
  ]
}
```

## Environment variable substitution

Any string value in `hal.config.json` or `hal.config.local.json` (except inside `context` blocks — see [Context](context/README.md)) can reference an environment variable with `${VAR_NAME}` syntax. Variables are resolved at boot time from the following sources in priority order (first match wins):

1. `{config-dir}/.env.local` _(gitignored)_
2. `{config-dir}/.env`
3. `{project-cwd}/.env.local` _(gitignored)_
4. `{project-cwd}/.env`
5. Shell environment (`process.env`)

```bash
# .env  (safe to commit — no real secrets)
BACKEND_BOT_TOKEN=
FRONTEND_BOT_TOKEN=

# .env.local  (gitignored — real secrets go here)
BACKEND_BOT_TOKEN=7123456789:AAHActual-token-here
FRONTEND_BOT_TOKEN=7987654321:AAHAnother-token-here
```

If a referenced variable cannot be resolved from any source the bot exits at boot with a clear error message naming the variable and the config field that references it.

On every boot an `info`-level log lists all config and env files that were loaded, in resolution order, so you can always see exactly where each value came from.

## globals

Default settings applied to all projects. Any setting defined in a project overrides its global counterpart.

| Key | Description | Default |
|-----|-------------|---------|
| `globals.engine.name` | Engine: `claude`, `copilot`, `codex`, `opencode`, `cursor`, `antigravity` | `"claude"` |
| `globals.engine.command` | Override the CLI command path | _(engine name)_ |
| `globals.engine.model` | Override the AI model (see [Engines](../engines/README.md#model-defaults)) | _(per engine)_ |
| `globals.engine.session` | Use persistent sessions (`--resume` / `--continue`) | `true` |
| `globals.engine.sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |
| `globals.engine.codex.*` | Codex permission flags | See [Codex](../engines/codex/README.md) |
| `globals.engine.antigravity.*` | Antigravity flags | See [Antigravity](../engines/antigravity/README.md) |
| `globals.logging` | Log level, flow, persist | See [Logging](logging/README.md) |
| `globals.rateLimit` | Max messages per user per time window | See [Rate limit](rate-limit/README.md) |
| `globals.providers` | Per-engine model lists for `/model` (see [Engines](../engines/README.md#model-list-providers-key)) | `{}` |
| `globals.access.allowedUserIds` | Telegram user IDs allowed by default | `[]` |
| `globals.dataDir` | Default user data directory | _(see [dataDir](#datadir-values) below)_ |
| `globals.transcription.model` | Whisper model for voice | `"base.en"` |
| `globals.transcription.showTranscription` | Show transcribed text | `true` |
| `globals.commands` | Toggle and configure built-in commands | See [Commands](commands/README.md) |

Per-engine options (Codex, Antigravity) are documented in [Engines](../engines/README.md).

## projects[]

Each project entry creates one Telegram bot connected to one directory.

| Key | Required | Description |
|-----|----------|-------------|
| `name` | No | Unique identifier used as a slug for logs/data paths |
| `active` | No | Set to `false` to skip this project at boot (default: `true`) |
| `cwd` | **Yes** | Path to the project directory (relative to config file, or absolute) |
| `telegram.botToken` | **Yes** | Telegram bot token from BotFather |
| `access.allowedUserIds` | No | Override the global user whitelist for this bot |
| `engine.name` | No | Override the engine for this project |
| `engine.command` | No | Override the CLI command path |
| `engine.model` | No | Override the AI model (see [Engines](../engines/README.md#model-defaults)) |
| `engine.session` | No | Use persistent sessions for this project |
| `engine.sessionMsg` | No | Message used when renewing session |
| `engine.codex.*` | No | Codex permission flags (see [Codex](../engines/codex/README.md)) |
| `engine.antigravity.*` | No | Antigravity flags (see [Antigravity](../engines/antigravity/README.md)) |
| `providers` | No | Override the global model list (see [Engines](../engines/README.md#model-list-providers-key)) |
| `logging` | No | Override logging (see [Logging](logging/README.md)) |
| `rateLimit` | No | Override rate limit (see [Rate limit](rate-limit/README.md)) |
| `transcription.showTranscription` | No | Override transcription display |
| `dataDir` | No | Override user data directory (see below) |
| `context` | No | Per-project context overrides (see [Context](context/README.md)) |
| `commands` | No | Toggle and configure built-in commands (see [Commands](commands/README.md)) |

## Project slug

The slug is used as a folder name for log and data paths. It is derived from:

1. The `name` field, if provided
2. Otherwise, the `cwd` value slugified (e.g. `./foo/bar` → `foo-bar`)

## dataDir values

| Value | Resolved Path |
|-------|---------------|
| _(empty)_ | `{project-cwd}/.hal/users` |
| `~` | `{config-dir}/.hal/{slug}/data` |
| Relative path (e.g. `.mydata`) | `{project-cwd}/{value}` |
| Absolute path | Used as-is |

Log file paths and options are documented in [Logging](logging/README.md).

## Directory structure

With a config at `~/workspace/hal.config.json`:

```
~/workspace/
├── hal.config.json
├── hal.config.local.json    (gitignored — local overrides / secrets)
├── .hal/
│   ├── hooks/
│   │   └── context.mjs            (global context hook, optional)
│   ├── commands/
│   │   └── mycommand.mjs          (global command, available to all projects)
│   └── logs/
│       ├── backend/
│       │   └── 2026-02-26.txt     (when persist: true)
│       └── frontend/
│           └── 2026-02-26.txt
├── .env                     (variable declarations, safe to commit)
├── .env.local               (gitignored — actual secret values)
├── backend/
│   ├── CLAUDE.md
│   ├── .claude/
│   │   ├── settings.json
│   │   └── skills/
│   │       └── deploy/
│   │           └── SKILL.md         (skill exposed as /deploy command)
│   └── .hal/
│       ├── hooks/
│       │   └── context.mjs        (project context hook, optional)
│       ├── commands/
│       │   └── deploy.mjs         (project-specific command, optional)
│       └── users/
│           └── {userId}/
│               ├── uploads/       # Files FROM user (to engine)
│               ├── downloads/     # Files TO user (from engine)
│               └── session.json   # Session data
└── frontend/
    ├── CLAUDE.md
    └── .hal/
        └── users/
```

## See also

| Topic | Description |
|-------|-------------|
| [Context](context/README.md) | Context injection — implicit keys, custom context, variable patterns, hooks |
| [Commands](commands/README.md) | Built-in command config — `/start`, `/help`, `/reset`, `/clean`, `/model`, `/git` |
| [Logging](logging/README.md) | Log level, flow, persist, log file paths |
| [Rate limit](rate-limit/README.md) | Max messages per user per window (`max`, `windowMs`) |
| [Engines](../engines/README.md) | Supported engines, engine config, model list, model defaults, per-engine setup |
