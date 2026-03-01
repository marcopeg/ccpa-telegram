<p align="center">
  <img src="https://raw.githubusercontent.com/marcopeg/hal/main/images/hal.jpg" alt="HAL 9000" width="120" />
</p>

<h1 align="center">HAL</h1>

A Telegram bot that provides access to AI coding agents as a personal assistant. Run multiple engines (Claude Code, GitHub Copilot, and more) across multiple projects simultaneously, each with its own dedicated Telegram bot.

## Features

- **Multi-engine support** — use Claude Code, GitHub Copilot, Codex, or OpenCode per project
- **Multi-project support** — run multiple bots from a single config, each connected to a different directory
- Chat with your AI coding agent via Telegram
- Send images and documents for analysis
- **Voice message support** with local Whisper transcription
- **File sending** — the engine can send files back to you
- **Context injection** — every message includes metadata (timestamps, user info, custom values) and supports hot-reloaded hooks
- **Custom slash commands** — add `.mjs` command files per-project or globally; hot-reloaded so the engine can create new commands at runtime
- **Skills** — `.claude/skills/` entries are automatically exposed as Telegram slash commands; no extra setup needed
- Persistent conversation sessions per user
- Per-project access control, rate limiting, and logging
- Log persistence to file with daily rotation support

## How It Works

This tool runs one AI coding agent subprocess per project, each in its configured working directory. The default engine is Claude Code, but each project can use a different engine.

The engine reads its standard config files from the project directory:

- `CLAUDE.md` / `AGENTS.md` — Project-specific instructions and context (filename depends on engine)
- `.claude/settings.json` — Permissions and tool settings (Claude Code)
- `.claude/commands/` — Custom slash commands
- `.mcp.json` — MCP server configurations

You get the full power of your chosen AI coding agent — file access, code execution, configured MCP tools — all accessible through Telegram.

### Supported Engines

| Engine | CLI Command | Status | Instructions File |
|--------|-------------|--------|-------------------|
| **Claude Code** | `claude` | Full support | `CLAUDE.md` |
| **GitHub Copilot** | `copilot` | Full support | `AGENTS.md` |
| **Codex** | `codex` | Full support | `AGENTS.md` |
| **OpenCode** | `opencode` | Stub (basic prompt/response) | `AGENTS.md` |

See [Engine Configuration](#engine-configuration) for setup details.

See [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code), [GitHub Copilot CLI documentation](https://docs.github.com/en/copilot/concepts/agents/copilot-cli), and the Codex CLI (`codex --help`) for engine-specific configuration.

## Prerequisites

- Node.js 18+
- At least one supported AI coding CLI installed and authenticated:
  - [Claude Code CLI](https://github.com/anthropics/claude-code) — `claude`
  - [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/copilot-cli) — `copilot`
  - [Codex CLI](https://github.com/openai/codex-cli) — `codex`
- A Telegram bot token per project (from [@BotFather](https://t.me/BotFather)) — see [Creating a Telegram Bot](#creating-a-telegram-bot)
- **ffmpeg** (required for voice messages) — `brew install ffmpeg` on macOS

## Quick Start

```bash
# Create hal.config.json in the current directory
npx @marcopeg/hal init

# Initialize with a specific engine
npx @marcopeg/hal init --engine copilot

# Edit hal.config.json: add your bot token and project path
# then start all bots
npx @marcopeg/hal
```

## Installation

```bash
# Initialize config in a specific directory
npx @marcopeg/hal init --cwd ./workspace

# Start bots using the config in that directory
npx @marcopeg/hal --cwd ./workspace
```

## Configuration

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

### Environment variable substitution

Any string value in `hal.config.json` or `hal.config.local.json` (except inside `context` blocks — see [Context Injection](#context-injection)) can reference an environment variable with `${VAR_NAME}` syntax. Variables are resolved at boot time from the following sources in priority order (first match wins):

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

### Context Injection

Every message sent to the engine is automatically enriched with a structured context header. This provides metadata (message info, timestamps, custom values) so the AI can reason about the current request without extra tool calls.

#### Implicit context (always-on)

These keys are injected for every message, even without any `context` configuration:

| Key | Description |
|-----|-------------|
| `bot.messageId` | Telegram message ID |
| `bot.timestamp` | Message Unix timestamp (seconds) |
| `bot.datetime` | Message datetime, ISO 8601 |
| `bot.userId` | Sender's Telegram user ID |
| `bot.username` | Sender's @username (if set) |
| `bot.firstName` | Sender's first name |
| `bot.chatId` | Chat ID |
| `bot.messageType` | `text` / `photo` / `document` / `voice` |
| `project.name` | Project name (falls back to internal slug if not set) |
| `project.cwd` | Resolved absolute project working directory |
| `project.slug` | Project slug (full path with `/` → `-`) |
| `sys.datetime` | Current local datetime with timezone |
| `sys.date` | Current date, `YYYY-MM-DD` |
| `sys.time` | Current time, `HH:MM:SS` |
| `sys.ts` | Current Unix timestamp (seconds) |
| `sys.tz` | Timezone name (e.g. `Europe/Berlin`) |
| `engine.name` | Engine identifier (e.g. `claude`, `copilot`) |
| `engine.command` | CLI command used to invoke the engine |
| `engine.model` | AI model from config (only present when explicitly set) |
| `engine.defaultModel` | HAL default model applied (only present when `engine.model` is omitted; see [Model defaults](#model-defaults)) |

#### Custom context via config

Add a `context` object at the root level of `hal.config.json` (applies to all projects) or inside individual projects (overrides root per key):

```json
{
  "globals": { ... },
  "context": {
    "messageId": "${bot.messageId}",
    "currentTime": "${sys.datetime}",
    "buildVersion": "#{git rev-parse --short HEAD}"
  },
  "projects": [
    {
      "name": "backend",
      "cwd": "./backend",
      "telegram": { "botToken": "${BACKEND_BOT_TOKEN}" },
      "context": {
        "project": "backend",
        "liveTimestamp": "@{date +\"%Y-%m-%d %H:%M:%S\"}"
      }
    }
  ]
}
```

Project context is merged on top of root — `backend` inherits `messageId`, `currentTime`, and `buildVersion` from root context, and adds `project` and `liveTimestamp`.

#### Variable substitution patterns

Three patterns are supported in context values:

| Pattern | Evaluated | Description |
|---------|-----------|-------------|
| `${expr}` | Per message | Looks up `expr` in implicit context (`bot.*`, `sys.*`), then env vars |
| `#{cmd}` | Once at boot | Runs shell command, caches result for all messages |
| `@{cmd}` | Per message | Runs shell command fresh for each message |

#### Context hooks

For advanced enrichment, you can provide a `context.mjs` hook file that transforms the context object with arbitrary JavaScript. Two hook locations are supported:

| Location | Scope |
|----------|-------|
| `{configDir}/.hal/hooks/context.mjs` | Global — runs for all projects |
| `{project.cwd}/.hal/hooks/context.mjs` | Project — runs for that project only |

When both exist, they chain: global runs first, its output feeds into the project hook. Both are **hot-reloaded** on every message (no restart needed) — so the AI engine itself can create or modify hooks at runtime.

```js
// .hal/hooks/context.mjs
export default async (context) => ({
  ...context,
  project: "my-tracker",
  user: await fetchUserProfile(context["bot.userId"])
})
```

- **Input**: fully-resolved `Record\<string, string\>` context
- **Output**: a `Record\<string, string\>` — the final context passed to the engine
- If a hook throws, the bot logs the error and falls back to the pre-hook context

#### Prompt format

The resolved context is prepended to the user message before passing to the engine:

```
# Context
- bot.messageId: 12345
- sys.datetime: 2026-02-26 14:30:00 UTC+1
- project: backend

# User Message
What files changed today?
```

### `globals`

Default settings applied to all projects. Any setting defined in a project overrides its global counterpart.

| Key | Description | Default |
|-----|-------------|---------|
| `globals.engine.name` | Engine: `claude`, `copilot`, `codex`, `opencode` | `"claude"` |
| `globals.engine.command` | Override the CLI command path | _(engine name)_ |
| `globals.engine.model` | Override the AI model (see [Model defaults](#model-defaults)) | _(per engine)_ |
| `globals.engine.session` | Use persistent sessions (`--resume` / `--continue`) | `true` |
| `globals.engine.sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |
| `globals.logging.level` | Log level: `debug`, `info`, `warn`, `error` | `"info"` |
| `globals.logging.flow` | Write logs to terminal | `true` |
| `globals.logging.persist` | Write logs to file | `false` |
| `globals.rateLimit.max` | Max messages per window per user | `10` |
| `globals.rateLimit.windowMs` | Rate limit window in ms | `60000` |
| `globals.access.allowedUserIds` | Telegram user IDs allowed by default | `[]` |
| `globals.dataDir` | Default user data directory | _(see below)_ |
| `globals.transcription.model` | Whisper model for voice | `"base.en"` |
| `globals.transcription.showTranscription` | Show transcribed text | `true` |
| `globals.commands` | Default `/start`, `/help`, `/reset`, `/clean` messages for all projects | _(see [`commands`](#commands))_ |

### `projects[]`

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
| `engine.model` | No | Override the AI model (see [Model defaults](#model-defaults)) |
| `engine.session` | No | Use persistent sessions for this project |
| `engine.sessionMsg` | No | Message used when renewing session |
| `transcription.showTranscription` | No | Override transcription display |
| `dataDir` | No | Override user data directory (see below) |
| `context` | No | Per-project context overrides (see [Context Injection](#context-injection)) |
| `commands` | No | Customize `/start`, `/help`, `/reset`, `/clean` messages (see [`commands`](#commands)) |

### `commands`

Customize the built-in `/start`, `/help`, `/reset`, and `/clean` command messages. Can be set under `globals` (shared default for all projects) or per project (overrides globals). Project-level settings take precedence.

```json
{
  "globals": {
    "commands": {
      "start": {
        "session": { "reset": true },
        "message": { "text": "Welcome, ${bot.firstName}!" }
      },
      "help": {
        "message": { "from": "./HELP.md" }
      },
      "reset": {
        "message": { "text": "All user data wiped. Starting fresh." }
      },
      "clean": {
        "message": { "text": "Session reset. Ready for a new conversation." }
      }
    }
  }
}
```

Each command supports a `message` object with exactly one of:

| Field | Description |
|-------|-------------|
| `message.text` | Inline message string |
| `message.from` | Path to a file (relative to project `cwd`) whose content is used as the message |

Setting both `text` and `from`, or neither, is a configuration error.

The `/start` command additionally supports `session.reset` (boolean, default `false`). When `true`, the session is reset after sending the welcome message (same effect as `/clean`).

The `/reset` command always wipes all user data (uploads, downloads, session) regardless of configuration — the custom message only changes what the user sees afterward.

The `/clean` command always resets the LLM session regardless of configuration — user files (uploads, downloads) are preserved. The custom message only changes what the user sees afterward.

**Defaults** (when no `commands` config is set):

| Command | Default message |
|---------|-----------------|
| `/start` | `Welcome to ${project.name}!` followed by the command list |
| `/help` | The command list |
| `/reset` | `All user data wiped and session reset. Your next message starts fresh.` |
| `/clean` | `Session reset. Your next message starts a new conversation.` |

Messages are sent with Telegram's legacy Markdown formatting. Supported syntax: `*bold*`, `_italic_`, `` `inline code` ``, ` ```code blocks``` `, `[link text](url)`.

#### Variable substitution in command messages

All `message.text` values and file contents from `message.from` support the same placeholder patterns used elsewhere:

| Pattern | Description |
|---------|-------------|
| `${varName}` | Implicit context (`bot.firstName`, `sys.date`, `project.name`, etc.) and env vars |
| `@{cmd}` | Message-time shell command |

Additionally, the special `${HAL_COMMANDS}` placeholder expands to a formatted list of all available commands, divided into three sections:

- **Commands** — built-in commands (`/start`, `/help`, `/reset`, `/clean`)
- **Custom Commands** — programmatic `.mjs` commands from global and project directories
- **Skills** — engine skills marked with `public: true` in their `SKILL.md` frontmatter

Example `WELCOME.md`:

```markdown
Welcome to ${project.name}, ${bot.firstName}!

${HAL_COMMANDS}
```

#### Making skills visible in the command list

By default, skills are not listed in `${HAL_COMMANDS}`. Add `public: true` to a skill's frontmatter to include it:

```yaml
---
name: crm
description: Manage your contacts
public: true
---
```

### Project Slug

The slug is used as a folder name for log and data paths. It is derived from:
1. The `name` field, if provided
2. Otherwise, the `cwd` value slugified (e.g. `./foo/bar` → `foo-bar`)

### `dataDir` Values

| Value | Resolved Path |
|-------|---------------|
| _(empty)_ | `{project-cwd}/.hal/users` |
| `~` | `{config-dir}/.hal/{slug}/data` |
| Relative path (e.g. `.mydata`) | `{project-cwd}/{value}` |
| Absolute path | Used as-is |

### Log Files

When `logging.persist: true`, logs are written to:
```
{config-dir}/.hal/logs/{project-slug}/YYYY-MM-DD.txt
```

### Engine Configuration

Set the engine globally or per-project. The engine determines which AI coding CLI is invoked for each message.

```json
{
  "globals": {
    "engine": { "name": "claude" }
  },
  "projects": [
    {
      "name": "backend",
      "cwd": "./backend",
      "telegram": { "botToken": "${BACKEND_BOT_TOKEN}" }
    },
    {
      "name": "frontend",
      "cwd": "./frontend",
      "engine": { "name": "copilot", "model": "gpt-5-mini" },
      "telegram": { "botToken": "${FRONTEND_BOT_TOKEN}" }
    },
    {
      "name": "legacy",
      "active": false,
      "cwd": "./legacy",
      "telegram": { "botToken": "${LEGACY_BOT_TOKEN}" }
    }
  ]
}
```

In this example:
- **backend** inherits the global engine (Claude Code, default model)
- **frontend** uses GitHub Copilot with the `gpt-5-mini` model
- **legacy** is inactive and will be skipped at boot

The `engine` object supports five fields:

| Field | Description | Default |
|-------|-------------|---------|
| `name` | Engine identifier: `claude`, `copilot`, `codex`, `opencode` | `"claude"` |
| `command` | Custom path to the CLI binary | _(engine name)_ |
| `model` | AI model override (omit for engine or HAL default; see [Model defaults](#model-defaults)) | _(per engine)_ |
| `session` | Use persistent sessions (`--resume` / `--continue`) | `true` |
| `sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |

#### Claude Code

- **CLI:** `claude` — install and authenticate via [Claude Code CLI](https://github.com/anthropics/claude-code) (see [Prerequisites](#prerequisites)).
- **Project files:** `CLAUDE.md`, `.claude/settings.json` (see [How It Works](#how-it-works)).
- **Config:** `engine.name: "claude"`. Optional: `engine.command`, `engine.model` (passed as `--model`), `engine.session`, `engine.sessionMsg`.
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `--resume {sessionId}`. `/clean` clears the stored session and replies with a static message (no engine call).

#### GitHub Copilot

- **CLI:** `copilot` — install and authenticate via [GitHub Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/copilot-cli) (see [Prerequisites](#prerequisites)).
- **Project file:** `AGENTS.md`.
- **Config:** `engine.name: "copilot"`. Optional: `engine.command`, `engine.model` (see table below), `engine.session`, `engine.sessionMsg`.
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `--continue`. `/clean` sends `engine.sessionMsg` to the engine without `--continue` to start a fresh session; the engine’s reply is sent to the user.

#### Codex

- **CLI:** `codex` — install and authenticate via [Codex CLI](https://github.com/openai/codex-cli) (see [Prerequisites](#prerequisites)).
- **Project file:** `AGENTS.md`.
- **Config:** `engine.name: "codex"`. Optional: `engine.command`, `engine.model` (e.g. `gpt-5.1-codex-mini`), `engine.session`, `engine.sessionMsg`.
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `codex exec resume --last` to continue the most recent session; otherwise `codex exec` starts a fresh run. `/clean` sends `engine.sessionMsg` without resuming, so the engine starts a new session; the engine's reply is sent to the user (same behaviour as Copilot).

#### GitHub Copilot Models

When using the `copilot` engine, the following models are available via `engine.model`:

| Model | Description |
|-------|-------------|
| `claude-sonnet-4.6` | Anthropic Claude Sonnet 4.6 |
| `claude-sonnet-4.5` | Anthropic Claude Sonnet 4.5 |
| `claude-haiku-4.5` | Anthropic Claude Haiku 4.5 |
| `claude-opus-4.6` | Anthropic Claude Opus 4.6 |
| `claude-opus-4.6-fast` | Anthropic Claude Opus 4.6 (fast) |
| `claude-opus-4.5` | Anthropic Claude Opus 4.5 |
| `claude-sonnet-4` | Anthropic Claude Sonnet 4 |
| `gemini-3-pro-preview` | Google Gemini 3 Pro (preview) |
| `gpt-5.3-codex` | OpenAI GPT-5.3 Codex |
| `gpt-5.2-codex` | OpenAI GPT-5.2 Codex |
| `gpt-5.2` | OpenAI GPT-5.2 |
| `gpt-5.1-codex-max` | OpenAI GPT-5.1 Codex Max |
| `gpt-5.1-codex` | OpenAI GPT-5.1 Codex |
| `gpt-5.1` | OpenAI GPT-5.1 |
| `gpt-5.1-codex-mini` | OpenAI GPT-5.1 Codex Mini |
| `gpt-5-mini` | OpenAI GPT-5 Mini |
| `gpt-4.1` | OpenAI GPT-4.1 |

#### Model defaults

When `engine.model` is omitted (neither in globals nor project config), behavior depends on the engine:

- **Engine default** — Codex, Copilot, and Cursor: HAL does not pass a model flag, so the CLI picks its own default (Cursor passes `--model auto`).
- **HAL default** — Claude Code and OpenCode: HAL passes a built-in default so the engine always receives a model. Defaults are defined in `src/default-models.ts`:
  - Claude Code: `default` (account-recommended model)
  - OpenCode: `opencode/gpt-5-nano` (free Zen model)

To change HAL defaults, edit `src/default-models.ts`.

## Directory Structure

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
│               ├── uploads/       # Files FROM user (to Claude)
│               ├── downloads/     # Files TO user (from Claude)
│               └── session.json   # Session data
└── frontend/
    ├── CLAUDE.md
    └── .hal/
        └── users/
```

## CLI Commands

```bash
# Show help
npx @marcopeg/hal --help

# Initialize config file
npx @marcopeg/hal init
npx @marcopeg/hal init --cwd ./workspace

# Start all bots
npx @marcopeg/hal
npx @marcopeg/hal --cwd ./workspace
```

## Bot Commands

| Command  | Description                                           |
|----------|-------------------------------------------------------|
| `/start` | Welcome message                                       |
| `/help`  | Show help information                                 |
| `/reset` | Wipes out all user data and resets the LLM session    |
| `/clean` | Resets the LLM session                                |

## Custom Commands

You can add your own slash commands as `.mjs` files. When a user sends `/mycommand`, the bot looks for a matching file before passing the message to Claude.

### File locations

| Location | Scope |
|----------|-------|
| `{project.cwd}/.hal/commands/{name}.mjs` | Project-specific |
| `{configDir}/.hal/commands/{name}.mjs` | Global — available to all projects |

Project-specific commands take precedence over global ones on name collision.

### Command file format

```js
// .hal/commands/deploy.mjs
export const description = 'Deploy the project'; // shown in Telegram's / menu

export default async function({ args, ctx, projectCtx }) {
  const env = args[0] ?? 'staging';
  return `Deploying to ${env}...`;
}
```

The only required export is `description` (shown in Telegram's `/` suggestion menu) and a `default` function. The return value is sent to the user as a message. Return `null` or `undefined` to suppress the reply (e.g. if your command sends its own response via `gram`).

### Handler arguments

#### `args: string[]`

Tokens following the command name, split on whitespace.

```
/deploy staging eu-west  →  args = ['staging', 'eu-west']
/status                  →  args = []
```

#### `ctx: Record\<string, string\>`

The fully-resolved context that would be sent to the AI for this message — identical to what the engine sees in its `# Context` header. Includes all implicit keys plus any config vars and hook results:

| Key group | Description |
|-----------|-------------|
| `bot.*` | `bot.userId`, `bot.username`, `bot.firstName`, `bot.chatId`, `bot.messageId`, `bot.timestamp`, `bot.datetime`, `bot.messageType` |
| `sys.*` | `sys.date`, `sys.time`, `sys.datetime`, `sys.ts`, `sys.tz` |
| `project.*` | `project.name`, `project.cwd`, `project.slug` |
| `engine.*` | `engine.name`, `engine.command`, `engine.model` (if set), `engine.defaultModel` (if HAL default applied) |
| custom | Any keys defined in `context` config blocks, after `${}` / `#{}` / `@{}` substitution and context hook transforms |

Use `/context` (the built-in global command) to inspect the exact keys available at runtime.

#### `gram: Grammy Context`

The raw [Grammy](https://grammy.dev) message context, giving direct access to the Telegram Bot API. Only needed for advanced use cases: sending multiple messages, editing or deleting messages, uploading files, reacting to messages, etc.

Common patterns:

```js
// Send a temporary status message, then delete it
const status = await gram.reply('Working...');
// ... do work ...
await gram.api.deleteMessage(gram.chat.id, status.message_id);

// Edit the status message while working
await gram.api.editMessageText(gram.chat.id, status.message_id, 'Still working...');

// React to the original message
await gram.react([{ type: 'emoji', emoji: '👍' }]);

// Send a file
await gram.replyWithDocument(new InputFile('/path/to/file.pdf'));
```

When using `gram` to send your own reply, return `null` or `undefined` to suppress the default text reply:

```js
export default async function({ gram }) {
  await gram.reply('Done!');
  return null;
}
```

#### `agent: Agent`

An engine-agnostic interface for making one-shot AI calls from within a command. The underlying provider is configured per-project — currently Claude Code, with support for other engines planned. Command handlers always use this interface and never talk to any engine directly.

```ts
interface Agent {
  call(
    prompt: string,
    options?: { onProgress?: (message: string) => void }
  ): Promise\<string\>;
}
```

Unlike regular user messages, agent calls have no session history and no context header prepended — the prompt is sent to the engine as-is.

| Option | Type | Description |
|--------|------|-------------|
| `onProgress` | `(message: string) => void` | Called during execution with activity updates (e.g. `"Reading: /path/to/file"`). Use it to keep the user informed while the agent is working. |

Returns the agent's final text output as a string. Throws on failure — the bot's command error handler will catch it and reply with `Command failed: {message}`.

```js
export default async function({ args, gram, agent }) {
  const status = await gram.reply('Thinking...');

  const answer = await agent.call(`Summarise: ${args.join(' ')}`, {
    onProgress: async (activity) => {
      try {
        await gram.api.editMessageText(gram.chat.id, status.message_id, `⏳ ${activity}`);
      } catch { /* ignore if message was already edited */ }
    },
  });

  await gram.api.deleteMessage(gram.chat.id, status.message_id);
  return answer;
}
```

See [`examples/.hal/commands/joke.mjs`](examples/.hal/commands/joke.mjs) for a full example that combines `gram` for live status cycling with `agent.call` + `onProgress` for activity updates.

#### `projectCtx: ProjectContext`

The project-level context object. Useful fields:

| Field | Type | Description |
|-------|------|-------------|
| `projectCtx.config.name` | `string \| undefined` | Project name from config |
| `projectCtx.config.slug` | `string` | Internal slug (used for log/data paths) |
| `projectCtx.config.cwd` | `string` | Absolute path to the project directory |
| `projectCtx.config.configDir` | `string` | Absolute path to the directory containing `hal.config.json` |
| `projectCtx.config.dataDir` | `string` | Absolute path to user data storage root |
| `projectCtx.config.context` | `Record\<string, string\> \| undefined` | Raw config-level context values (pre-hook) |
| `projectCtx.logger` | Pino logger | Structured logger — use for debug output that ends up in log files |

### Examples

- [`examples/obsidian/.hal/commands/status.mjs`](examples/obsidian/.hal/commands/status.mjs) — project-specific command using `projectCtx.config`
- [`examples/.hal/commands/context.mjs`](examples/.hal/commands/context.mjs) — global command that dumps the full resolved context
- [`examples/.hal/commands/joke.mjs`](examples/.hal/commands/joke.mjs) — global command using `agent.call` with live status cycling and `onProgress` updates

### Skills

[Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) live in `.claude/skills/` inside the project directory (shared across all engines). Each skill is a folder containing a `SKILL.md` file with a YAML frontmatter block and a prompt body:

```
{project-cwd}/
└── .claude/
    └── skills/
        └── chuck/
            └── SKILL.md
```

```markdown
---
name: chuck
description: Tells a joke about Chuck Norris.
---

Tell a short, funny joke about Chuck Norris.
```

At boot time (and whenever `SKILL.md` files change) the bot reads every skill folder, parses the frontmatter, and registers the skills as Telegram slash commands via `setMyCommands`. The **folder name** is used as the command name — if the frontmatter `name` field differs from the folder name the bot logs a warning and uses the folder name.

When a user invokes a skill command (e.g. `/chuck`) the bot:
1. Reads the `SKILL.md` prompt body
2. Appends any user arguments as `User input: {args}` if present
3. Calls the AI engine with that prompt via the engine-agnostic `agent.call()` interface
4. Sends the response back to the user

Skills can be **overridden per-project**: create a `.hal/commands/{name}.mjs` file with the same name as the skill and the `.mjs` handler takes full precedence.

**Command precedence** (highest wins):

```
project .hal/commands/{name}.mjs  >  global .hal/commands/{name}.mjs  >  .claude/skills/{name}/
```

See [`examples/obsidian/.claude/skills/chuck/`](examples/obsidian/.claude/skills/chuck/SKILL.md) and [`examples/obsidian/.claude/skills/weather/`](examples/obsidian/.claude/skills/weather/SKILL.md) for example skills.


### Hot-reload

Commands and skills are **hot-reloaded** — drop a new `.mjs` file or `SKILL.md` into the relevant directory and the bot registers it with Telegram automatically, with no restart. This means the AI engine can write new command or skill files as part of a task and users see them in the `/` menu immediately.

## Creating a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Choose a display name (e.g. "My Backend Assistant")
4. Choose a username ending in `bot` (e.g. `my_backend_assistant_bot`)
5. Add the token to `.env.local` and reference it via `${VAR_NAME}` in `hal.config.json`

For each project you need a separate bot and token.

## Finding Your Telegram User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your numeric user ID
3. Add it to `allowedUserIds`

## Voice Messages

Voice messages are transcribed locally using [Whisper](https://github.com/openai/whisper) via the `nodejs-whisper` package. No audio is sent to external services.

### Setup

1. **ffmpeg** — for audio conversion
   ```bash
   brew install ffmpeg         # macOS
   sudo apt install ffmpeg     # Ubuntu/Debian
   ```

2. **CMake** — for building the Whisper executable
   ```bash
   brew install cmake          # macOS
   sudo apt install cmake      # Ubuntu/Debian
   ```

3. **Download and build Whisper** — run once after installation:
   ```bash
   npx nodejs-whisper download
   ```

### Whisper Models

| Model | Size | Speed | Quality |
|-------|------|-------|---------|
| `tiny` | ~75 MB | Fastest | Basic |
| `tiny.en` | ~75 MB | Fastest | English-only |
| `base` | ~142 MB | Fast | Good |
| `base.en` | ~142 MB | Fast | English-only (default) |
| `small` | ~466 MB | Medium | Good multilingual |
| `medium` | ~1.5 GB | Slower | Very good multilingual |
| `large-v3-turbo` | ~1.5 GB | Fast | Near-large quality |

## Sending Files to Users

The engine can send files back through Telegram. Each user has a `downloads/` folder under their data directory. The engine is informed of this path in every prompt.

1. The engine writes a file to the downloads folder
2. The bot detects it after the engine's response completes
3. The file is sent via Telegram (as a document)
4. The file is deleted from the server after delivery

## Migration from v1 (Single-Project Config)

The old single-project config format is no longer supported. Migrate by wrapping your config:

**Before:**
```json
{
  "telegram": { "botToken": "..." },
  "access": { "allowedUserIds": [123] },
  "claude": { "command": "claude" },
  "logging": { "level": "info" }
}
```

**After:**
```json
{
  "globals": {
    "engine": { "name": "claude" },
    "logging": { "level": "info" }
  },
  "projects": [
    {
      "cwd": ".",
      "telegram": { "botToken": "..." },
      "access": { "allowedUserIds": [123] }
    }
  ]
}
```

> **Note:** Named environment variable overrides from v1 (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`, etc.) are no longer supported. Use `${VAR_NAME}` substitution in `hal.config.json` instead — see [Environment variable substitution](#environment-variable-substitution).

## Security Notice

**Important**: Conversations with this bot are not end-to-end encrypted. Messages pass through Telegram's servers. Do not share:

- Passwords or API keys
- Personal identification numbers
- Financial information
- Confidential business data

This bot is intended for development assistance only. Treat all conversations as potentially visible to third parties.

## License

ISC
