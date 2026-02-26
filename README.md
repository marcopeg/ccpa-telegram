# ccpa-telegram

A Telegram bot that provides access to Claude Code as a personal assistant. Run Claude Code across multiple projects simultaneously, each with its own dedicated Telegram bot.

## Features

- **Multi-project support** — run multiple bots from a single config, each connected to a different directory
- Chat with Claude Code via Telegram
- Send images and documents for analysis
- **Voice message support** with local Whisper transcription
- **File sending** — Claude can send files back to you
- **Context injection** — every message includes metadata (timestamps, user info, custom values) and supports hot-reloaded hooks
- Persistent conversation sessions per user
- Per-project access control, rate limiting, and logging
- Log persistence to file with daily rotation support

## How It Works

This tool runs one Claude Code subprocess per project, each in its configured working directory. Claude Code reads all its standard config files from that directory:

- `CLAUDE.md` — Project-specific instructions and context
- `.claude/settings.json` — Permissions and tool settings
- `.claude/commands/` — Custom slash commands
- `.mcp.json` — MCP server configurations

You get the full power of Claude Code — file access, code execution, configured MCP tools — all accessible through Telegram.

See [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code) for details on Claude Code configuration.

## Prerequisites

- Node.js 18+
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated
- A Telegram bot token per project (from [@BotFather](https://t.me/BotFather)) — see [Creating a Telegram Bot](#creating-a-telegram-bot)
- **ffmpeg** (required for voice messages) — `brew install ffmpeg` on macOS

## Quick Start

```bash
# Create a ccpa.config.json in the current directory
npx ccpa-telegram init

# Edit ccpa.config.json: add your bot token and project path
# then start all bots
npx ccpa-telegram
```

## Installation

```bash
# Initialize config in a specific directory
npx ccpa-telegram init --cwd ./workspace

# Start bots using the config in that directory
npx ccpa-telegram --cwd ./workspace
```

## Configuration

### ccpa.config.json

Create a `ccpa.config.json` in your workspace directory (where you run the CLI from). Secrets like bot tokens should be kept out of this file — use `${VAR_NAME}` placeholders and store the values in `.env.local` or the shell environment instead.

```json
{
  "globals": {
    "claude": { "command": "claude" },
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
      "telegram": { "botToken": "${FRONTEND_BOT_TOKEN}" },
      "access": { "allowedUserIds": [123456789] }
    }
  ]
}
```

### ccpa.config.local.json

An optional `ccpa.config.local.json` placed next to `ccpa.config.json` is deep-merged on top of the base config at boot time. It is gitignored and is the recommended place for machine-specific values or secrets that you don't want committed.

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

Any string value in `ccpa.config.json` or `ccpa.config.local.json` (except inside `context` blocks — see [Context Injection](#context-injection)) can reference an environment variable with `${VAR_NAME}` syntax. Variables are resolved at boot time from the following sources in priority order (first match wins):

1. `<config-dir>/.env.local` _(gitignored)_
2. `<config-dir>/.env`
3. `<project-cwd>/.env.local` _(gitignored)_
4. `<project-cwd>/.env`
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

Every message sent to Claude is automatically enriched with a structured context header. This provides metadata (message info, timestamps, custom values) so Claude can reason about the current request without extra tool calls.

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
| `project.slug` | Claude Code-compatible slug (full path with `/` → `-`) |
| `sys.datetime` | Current local datetime with timezone |
| `sys.date` | Current date, `YYYY-MM-DD` |
| `sys.time` | Current time, `HH:MM:SS` |
| `sys.ts` | Current Unix timestamp (seconds) |
| `sys.tz` | Timezone name (e.g. `Europe/Berlin`) |

#### Custom context via config

Add a `context` object at the root level of `ccpa.config.json` (applies to all projects) or inside individual projects (overrides root per key):

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
| `{configDir}/.ccpa/hooks/context.mjs` | Global — runs for all projects |
| `{project.cwd}/.ccpa/hooks/context.mjs` | Project — runs for that project only |

When both exist, they chain: global runs first, its output feeds into the project hook. Both are **hot-reloaded** on every message (no restart needed) — so Claude Code itself can create or modify hooks at runtime.

```js
// .ccpa/hooks/context.mjs
export default async (context) => ({
  ...context,
  project: "my-tracker",
  user: await fetchUserProfile(context["bot.userId"])
})
```

- **Input**: fully-resolved `Record<string, string>` context
- **Output**: a `Record<string, string>` — the final context passed to Claude
- If a hook throws, the bot logs the error and falls back to the pre-hook context

#### Prompt format

The resolved context is prepended to the user message before passing to Claude:

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
| `globals.claude.command` | Claude CLI command | `"claude"` |
| `globals.logging.level` | Log level: `debug`, `info`, `warn`, `error` | `"info"` |
| `globals.logging.flow` | Write logs to terminal | `true` |
| `globals.logging.persist` | Write logs to file | `false` |
| `globals.rateLimit.max` | Max messages per window per user | `10` |
| `globals.rateLimit.windowMs` | Rate limit window in ms | `60000` |
| `globals.access.allowedUserIds` | Telegram user IDs allowed by default | `[]` |
| `globals.dataDir` | Default user data directory | _(see below)_ |
| `globals.transcription.model` | Whisper model for voice | `"base.en"` |
| `globals.transcription.showTranscription` | Show transcribed text | `true` |

### `projects[]`

Each project entry creates one Telegram bot connected to one directory.

| Key | Required | Description |
|-----|----------|-------------|
| `name` | No | Unique identifier used as a slug for logs/data paths |
| `cwd` | **Yes** | Path to the project directory (relative to config file, or absolute) |
| `telegram.botToken` | **Yes** | Telegram bot token from BotFather |
| `access.allowedUserIds` | No | Override the global user whitelist for this bot |
| `claude.command` | No | Override the Claude CLI command |
| `logging.level` | No | Override log level |
| `logging.flow` | No | Override terminal logging |
| `logging.persist` | No | Override file logging |
| `rateLimit.max` | No | Override rate limit max |
| `rateLimit.windowMs` | No | Override rate limit window |
| `transcription.model` | No | Override Whisper model |
| `transcription.showTranscription` | No | Override transcription display |
| `dataDir` | No | Override user data directory (see below) |
| `context` | No | Per-project context overrides (see [Context Injection](#context-injection)) |

### Project Slug

The slug is used as a folder name for log and data paths. It is derived from:
1. The `name` field, if provided
2. Otherwise, the `cwd` value slugified (e.g. `./foo/bar` → `foo-bar`)

### `dataDir` Values

| Value | Resolved Path |
|-------|---------------|
| _(empty)_ | `<project-cwd>/.ccpa/users` |
| `~` | `<config-dir>/.ccpa/<slug>/data` |
| Relative path (e.g. `.mydata`) | `<project-cwd>/<value>` |
| Absolute path | Used as-is |

### Log Files

When `logging.persist: true`, logs are written to:
```
<config-dir>/.ccpa/<project-slug>/logs/YYYY-MM-DD.txt
```

## Directory Structure

With a config at `~/workspace/ccpa.config.json`:

```
~/workspace/
├── ccpa.config.json
├── ccpa.config.local.json   (gitignored — local overrides / secrets)
├── .env                     (variable declarations, safe to commit)
├── .env.local               (gitignored — actual secret values)
├── .ccpa/
│   ├── hooks/
│   │   └── context.mjs            (global context hook, optional)
│   ├── backend/
│   │   └── logs/
│   │       └── 2026-02-26.txt     (when persist: true)
│   └── frontend/
│       └── logs/
│           └── 2026-02-26.txt
├── backend/
│   ├── CLAUDE.md
│   ├── .claude/settings.json
│   └── .ccpa/
│       ├── hooks/
│       │   └── context.mjs        (project context hook, optional)
│       └── users/
│           └── {userId}/
│               ├── uploads/       # Files FROM user (to Claude)
│               ├── downloads/     # Files TO user (from Claude)
│               └── session.json   # Session data
└── frontend/
    ├── CLAUDE.md
    └── .ccpa/
        └── users/
```

## CLI Commands

```bash
# Show help
npx ccpa-telegram --help

# Initialize config file
npx ccpa-telegram init
npx ccpa-telegram init --cwd ./workspace

# Start all bots
npx ccpa-telegram
npx ccpa-telegram --cwd ./workspace
```

## Bot Commands

| Command  | Description                |
|----------|----------------------------|
| `/start` | Welcome message            |
| `/help`  | Show help information      |
| `/clear` | Clear conversation history |

## Creating a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Choose a display name (e.g. "My Backend Assistant")
4. Choose a username ending in `bot` (e.g. `my_backend_assistant_bot`)
5. Add the token to `.env.local` and reference it via `${VAR_NAME}` in `ccpa.config.json`

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

Claude can send files back through Telegram. Each user has a `downloads/` folder under their data directory. Claude is informed of this path in every prompt.

1. Claude writes a file to the downloads folder
2. The bot detects it after Claude's response completes
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
    "claude": { "command": "claude" },
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

> **Note:** Named environment variable overrides from v1 (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`, etc.) are no longer supported. Use `${VAR_NAME}` substitution in `ccpa.config.json` instead — see [Environment variable substitution](#environment-variable-substitution).

## Security Notice

**Important**: Conversations with this bot are not end-to-end encrypted. Messages pass through Telegram's servers. Do not share:

- Passwords or API keys
- Personal identification numbers
- Financial information
- Confidential business data

This bot is intended for development assistance only. Treat all conversations as potentially visible to third parties.

## License

ISC
