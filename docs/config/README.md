# Configuration

HAL is configured via a config file in the directory where you run the CLI. The recommended way to create or complete your config is the **[Setup wizard](../setup-wizard/README.md)** — run `npx @marcopeg/hal wiz`, or run `npx @marcopeg/hal` and accept the prompt when HAL detects the config is missing/incomplete. Three formats are supported — only one per file is allowed.

| Format | Extension | Features |
|--------|-----------|----------|
| JSON | `.json` | Standard JSON |
| JSONC | `.jsonc` | JSON with `//` and `/* */` comments, trailing commas |
| YAML | `.yaml` / `.yml` | Full YAML syntax with native comments |

| File | Purpose |
|------|---------|
| `hal.config.{json,jsonc,yaml}` | Main config (required) |
| `hal.config.local.{json,jsonc,yaml}` | Local overrides (optional, gitignored) |

Base and local configs can use different formats (e.g. `hal.config.yaml` + `hal.config.local.json`). If multiple formats exist for the same file (e.g. both `.json` and `.jsonc`), the loader exits with an error.

This section is the index for all configuration options; detailed subsections are split into focused docs.

## Config files

### hal.config.{json,jsonc,yaml}

Create a config file in your workspace directory (where you run the CLI from). Secrets like bot tokens should be kept out of this file — use `${VAR_NAME}` placeholders and store the values in `.env.local` or the shell environment instead.

**YAML** is the recommended format for examples and for configs with comments. A full key reference (all options, with links to doc pages) is [reference.yaml](reference.yaml). A short copy-paste example is [examples/hal.config.yaml](../../examples/hal.config.yaml). JSON and JSONC are also supported — see [Configuration alternatives](#configuration-alternatives) below.

Example (YAML):

```yaml
globals:
  engine:
    name: claude
  logging:
    level: info
    flow: true
    persist: false
  rateLimit:
    max: 10
    windowMs: 60000
  access:
    allowedUserIds: [123456789]

projects:
  backend:
    cwd: ./backend
    telegram:
      botToken: "${BACKEND_BOT_TOKEN}"
    logging:
      persist: true
  frontend:
    cwd: ./frontend
    engine:
      name: copilot
      model: gpt-5-mini
    telegram:
      botToken: "${FRONTEND_BOT_TOKEN}"
```

### hal.config.local.{json,jsonc,yaml}

An optional local config file placed next to the main config is deep-merged on top of the base config at boot time. It is gitignored and is the recommended place for machine-specific values or secrets that you don't want committed.

Every field is optional. `projects` is a map with the same keys as the base config; each local entry is deep-merged into the base project with the same key. Keys that do not exist in the base config are invalid and cause a load error — you cannot introduce new projects from local config.

```yaml
projects:
  backend:
    telegram:
      botToken: "7123456789:AAHActual-token-here"
    logging:
      persist: true
```

## Configuration alternatives

`hal.config.json` and `hal.config.jsonc` are supported alongside `hal.config.yaml`. Runtime behavior is identical; the loader accepts any of the three formats (one per file).

For a full config structure use the YAML [reference](reference.yaml) or [example](../../examples/hal.config.yaml); you can convert to JSON/JSONC (e.g. with a tool or AI) if needed.

**JSONC** supports:

- Single-line comments: `//`
- Block comments: `/* ... */`
- Trailing commas in objects and arrays

JSONC does **not** support: unquoted keys, single-quoted strings, or other non-standard JSON extensions.

Minimal **JSON** example (globals + one project):

```json
{
  "globals": {
    "engine": { "name": "claude" },
    "access": { "allowedUserIds": [123456789] }
  },
  "projects": {
    "mybot": {
      "telegram": { "botToken": "${BOT_TOKEN}" }
    }
  }
}
```

Minimal **JSONC** example (same structure with `//` comments and trailing commas):

```jsonc
{
  "globals": {
    "engine": { "name": "claude" },
    "access": { "allowedUserIds": [123456789] },
  },
  "projects": {
    "mybot": {
      "telegram": { "botToken": "${BOT_TOKEN}" },
    },
  },
}
```

## Environment variable substitution

Any string value in the config files (except inside `context` blocks — see [Context](context/README.md)) can reference an environment variable with `${VAR_NAME}` syntax. This works identically for all config formats (JSON, JSONC, YAML). Variables are resolved at boot time from **one** of two modes:

### Single-source model

- **Default (no `env` in config):** Env is loaded only from the config directory (the directory where you run the CLI): `{config-dir}/.env`, then `{config-dir}/.env.local`. The `.local` file overrides the base file. No per-project `.env` files are loaded.
- **Explicit (`env` set):** Env is loaded only from the path you set in the top-level `env` key and its sibling `.local` file (e.g. `env: "secrets.env"` → `secrets.env` and `secrets.env.local` in the same directory). The config-dir `.env` is **not** loaded in this mode.

Resolution order within each mode:

- **Default mode:** `{config-dir}/.env`, then `{config-dir}/.env.local` (later overrides).
- **Explicit mode:** The configured file, then that file’s `.local` sibling in the same directory (e.g. `path/to/secrets.env` then `path/to/secrets.env.local`).

The `env` path is resolved relative to the config file’s directory, or as an absolute path. Tilde (`~`) is expanded to your home directory.

### Conflict (boot error)

If `env` is set and points to a **different** file than `{config-dir}/.env`, and `{config-dir}/.env` or `{config-dir}/.env.local` exists, the process exits at boot with an error. Use only one source: either remove `env` and use config-dir `.env`, or remove/rename the config-dir `.env` files and use `env`.

### Missing or unreadable custom file (boot error)

When `env` is set, the main file (the one you specified) must exist and be readable. If it is missing or unreadable, the process exits at boot with a clear error and a link to this documentation. The `.local` sibling remains optional.

### Watcher

When `env` is set, the config watcher also watches the custom env path and its `.local` sibling. Changes to either file (or creation of the `.local` file after startup) trigger a config reload, same as for other config files.

### Example (default mode)

```bash
# {config-dir}/.env  (safe to commit — no real secrets)
BACKEND_BOT_TOKEN=
FRONTEND_BOT_TOKEN=

# {config-dir}/.env.local  (gitignored — real secrets go here)
BACKEND_BOT_TOKEN=7123456789:AAHActual-token-here
FRONTEND_BOT_TOKEN=7987654321:AAHAnother-token-here
```

If a referenced variable cannot be resolved from any source the bot exits at boot with a clear error message naming the variable and the config field that references it.

On every boot an `info`-level log lists all config and env files that were loaded, in order, so you can see exactly where each value came from.

## globals

Default settings applied to all projects. Any setting defined in a project overrides its global counterpart.

| Key | Description | Default |
|-----|-------------|---------|
| `globals.engine.name` | **Required** (unless every project sets its own). Engine: `claude`, `copilot`, `codex`, `opencode`, `cursor`, `antigravity` | — |
| `globals.engine.command` | Override the CLI command path | _(engine name)_ |
| `globals.engine.model` | Override the AI model (see [Engines](../engines/README.md#model-defaults)) | _(per engine)_ |
| `globals.engine.session` | Session mode: `false` (stateless), `true` (adapter default, omit = same), `"shared"`, or `"user"`. See [Session configuration](session/README.md). **`"user"` with OpenCode/Copilot fails at boot.** | `true` |
| `globals.engine.sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |
| `globals.engine.envFile` | Path to an env file sourced before running the engine CLI (child process only; not for HAL config substitution). Relative to project `cwd`; absolute paths used as-is. Active projects with a missing/unreadable file fail at boot. | _(none)_ |
| `globals.engine.codex.*` | Codex permission flags | See [Codex](../engines/codex/README.md) |
| `globals.engine.antigravity.*` | Antigravity flags | See [Antigravity](../engines/antigravity/README.md) |
| `globals.logging` | Log level, flow, persist | See [Logging](logging/README.md) |
| `globals.rateLimit` | Max messages per user per time window | See [Rate limit](rate-limit/README.md) |
| `globals.access.allowedUserIds` | Telegram user IDs allowed by default (entries may be numbers or strings for env substitution; after substitution they are validated and normalized to numeric IDs) | `[]` |
| `globals.access.dangerouslyAllowUnrestrictedAccess` | Allow all users without a whitelist (must be explicitly `true`) | `false` |
| `globals.dataDir` | Default user data directory | _(see [dataDir](#datadir-values) below)_ |
| `globals.transcription.model` | Whisper model for voice | `"base.en"` |
| `globals.transcription.showTranscription` | Show transcribed text | `true` |
| `globals.commands` | Toggle and configure built-in commands | See [Commands](commands/README.md) |

Per-engine options (Codex, Antigravity) are documented in [Engines](../engines/README.md).

### Session configuration

`engine.session` is a single value: `false` (stateless), `true` (adapter default), `"shared"`, or `"user"`. Full reference, per-engine behaviour, and boot-error rules: [Session configuration](session/README.md).

## providers

Per-engine model lists for the `/model` command and the set of engines available for `/engine`. Top-level sibling of `globals` and `projects`. Entries may include `default: true` (at most one per engine) to set the model when `engine.model` is omitted. Explicit `engine.model` always overrides the provider default. See [Engines — Model list](../engines/README.md#model-list-providers-key) for full details, field reference, and examples.

Per-project `providers` can override the top-level list for a specific project (only for engines already listed in the base config; local config cannot add new engine keys).

**Configuration shapes:**

| Config shape | Meaning |
|--------------|--------|
| No `providers` key | HAL runs a fast CLI check at boot; if more than one engine is available, `/engine` is enabled with that list. |
| `providers: {}` or `providers:` (no sub-keys) | Engine and model switching disabled. No boot discovery. Projects cannot change engine or model via `/engine` or `/model`. |
| `providers: { opencode:, codex: }` (empty lists) | Only opencode and codex appear in `/engine`. Default models or CLI auto-discovery (OpenCode/Cursor) for `/model`. |
| `providers` with one or more engine keys | Every project’s `engine.name` must be one of those keys; otherwise HAL fails at boot with a clear error. |

When `/engine`, `/model`, or `/info` is disabled, sending the command replies *"This command is disabled."* instead of forwarding to the LLM.

## Access control

Every project must have a valid access policy or the bot refuses to start. A valid policy is one of:

- `access.allowedUserIds` contains at least one Telegram user ID, **or**
- `access.dangerouslyAllowUnrestrictedAccess` is explicitly `true`.

When `allowedUserIds` is non-empty it takes precedence — only listed users are allowed, even if `dangerouslyAllowUnrestrictedAccess` is also `true`.

**Format:** Each `allowedUserIds` entry may be a number (e.g. `123456789`) or a string (e.g. `"123456789"` or `"${TELEGRAM_USER_ID}"` for env substitution). After environment variable substitution, every value is validated as a valid Telegram user ID (positive integer in the official range) and normalized to a number. Invalid values (e.g. spaces, decimals, non-numeric text) cause config load to fail with an error that includes the config path and the invalid value; the process exits at boot or on hot reload.

**Project-level replacement:** if a project defines `access` (even as `"access": {}`), it fully replaces the global `access` — the two are not merged. If a project omits `access` entirely, the global value is inherited. An empty `"access": {}` at project level is a validation error because it has neither user IDs nor the dangerous flag.

This validation runs at both initial boot and after config hot-reload. A reload that introduces an invalid access config is rejected and the previous config stays active.

## projects (map)

`projects` is an object (map) keyed by **project key**. Each key identifies one project and one Telegram bot connected to one directory. The key is the project’s **slug** (used in logs, data paths, and errors).

**Key format:** Only letters, numbers, dashes, and underscores (`[a-zA-Z0-9_-]+`). This keeps the default `cwd` safe as a path segment when omitted.

**Defaults from key:** If you omit `name`, it defaults to the map key. If you omit `cwd`, it defaults to the map key (so a key `backend` implies `cwd: "backend"` unless overridden). You can still set `name` and `cwd` explicitly to override these defaults.

| Key | Required | Description |
|-----|----------|-------------|
| `name` | No | Display name; defaults to the project key (map key) |
| `active` | No | Set to `false` to skip this project at boot (default: `true`) |
| `cwd` | No | Path to the project directory (relative to config file, or absolute); defaults to the project key |
| `telegram.botToken` | **Yes** | Telegram bot token from BotFather |
| `access.allowedUserIds` | No | User whitelist for this bot — numbers or strings (env substitution supported); validated and normalized to numeric IDs (replaces global `access` when set) |
| `access.dangerouslyAllowUnrestrictedAccess` | No | Allow all users for this bot (replaces global `access` entirely when set) |
| `engine.name` | No | Override the engine for this project (required if globals does not set one) |
| `engine.command` | No | Override the CLI command path |
| `engine.model` | No | Override the AI model (see [Engines](../engines/README.md#model-defaults)) |
| `engine.session` | No | Session mode for this project: `false` \| `true` \| `"shared"` \| `"user"` (see [Session configuration](session/README.md)) |
| `engine.sessionMsg` | No | Message used when renewing session |
| `engine.envFile` | No | Path to an env file sourced before running the engine CLI (child process only). Relative to this project's `cwd` or absolute. Missing/unreadable at boot causes boot failure for this project. |
| `engine.codex.*` | No | Codex permission flags (see [Codex](../engines/codex/README.md)) |
| `engine.antigravity.*` | No | Antigravity flags (see [Antigravity](../engines/antigravity/README.md)) |
| `providers` | No | Override the top-level model list for this project; entries may include `default: true` (at most one per list). See [Engines](../engines/README.md#model-list-providers-key). |
| `logging` | No | Override logging (see [Logging](logging/README.md)) |
| `rateLimit` | No | Override rate limit (see [Rate limit](rate-limit/README.md)) |
| `transcription.showTranscription` | No | Override transcription display |
| `dataDir` | No | Override user data directory (see below) |
| `context` | No | Per-project context overrides (see [Context](context/README.md)) |
| `commands` | No | Toggle and configure built-in commands (see [Commands](commands/README.md)) |

## Project slug

The slug is used as a folder name for log and data paths. It is always the **project key** (the key in the `projects` map). It is not derived from `name` or `cwd`; the map key is the single source of identity.

## dataDir values

| Value | Resolved Path |
|-------|---------------|
| _(empty)_ | `{project-cwd}/.hal/users` |
| `~` | `{config-dir}/.hal/{slug}/data` |
| Relative path (e.g. `.mydata`) | `{project-cwd}/{value}` |
| Absolute path | Used as-is |

Log file paths and options are documented in [Logging](logging/README.md).

## Directory structure

With a config at `~/workspace/hal.config.yaml` (or `.json` / `.jsonc`):

```
~/workspace/
├── hal.config.yaml          (or .json / .jsonc)
├── hal.config.local.yaml    (or .json / .jsonc — gitignored, local overrides / secrets)
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
| [Session](session/README.md) | Session mode: `false` \| `true` \| `"shared"` \| `"user"`; per-engine support and boot errors |
| [Context](context/README.md) | Context injection — implicit keys, custom context, variable patterns, hooks |
| [Commands](commands/README.md) | Built-in command config — `/start`, `/help`, `/reset`, `/clean`, `/model`, `/engine`, `/git` |
| [Logging](logging/README.md) | Log level, flow, persist, log file paths |
| [Rate limit](rate-limit/README.md) | Max messages per user per window (`max`, `windowMs`) |
| [Engines](../engines/README.md) | Supported engines, engine config, model list, model defaults, per-engine setup |
