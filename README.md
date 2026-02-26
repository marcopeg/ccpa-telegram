# telegrapp

A Telegram bot that provides access to Claude Code as a personal assistant. Run Claude Code across multiple projects simultaneously, each with its own dedicated Telegram bot.

## Features

- **Multi-project support** — run multiple bots from a single config, each connected to a different directory
- Chat with Claude Code via Telegram
- Send images and documents for analysis
- **Voice message support** with local Whisper transcription
- **File sending** — Claude can send files back to you
- **Context injection** — every message includes metadata (timestamps, user info, custom values) and supports hot-reloaded hooks
- **Custom slash commands** — add `.mjs` command files per-project or globally; hot-reloaded so Claude can create new commands at runtime
- **Skills** — Claude Code `.claude/skills/` entries are automatically exposed as Telegram slash commands; no extra setup needed
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
# Create .telegrapp/config.json in the current directory
npx telegrapp init

# Edit .telegrapp/config.json: add your bot token and project path
# then start all bots
npx telegrapp
```

## Installation

```bash
# Initialize config in a specific directory
npx telegrapp init --cwd ./workspace

# Start bots using the config in that directory
npx telegrapp --cwd ./workspace
```

## Configuration

### .telegrapp/config.json

Create a `.telegrapp/config.json` in your workspace directory (where you run the CLI from). Secrets like bot tokens should be kept out of this file — use `${VAR_NAME}` placeholders and store the values in `.env.local` or the shell environment instead.

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

### .telegrapp/config.local.json

An optional `.telegrapp/config.local.json` placed next to `.telegrapp/config.json` is deep-merged on top of the base config at boot time. It is gitignored and is the recommended place for machine-specific values or secrets that you don't want committed.

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

Any string value in `.telegrapp/config.json` or `.telegrapp/config.local.json` (except inside `context` blocks — see [Context Injection](#context-injection)) can reference an environment variable with `${VAR_NAME}` syntax. Variables are resolved at boot time from the following sources in priority order (first match wins):

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

Add a `context` object at the root level of `.telegrapp/config.json` (applies to all projects) or inside individual projects (overrides root per key):

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
| `{configDir}/.telegrapp/hooks/context.mjs` | Global — runs for all projects |
| `{project.cwd}/.telegrapp/hooks/context.mjs` | Project — runs for that project only |

When both exist, they chain: global runs first, its output feeds into the project hook. Both are **hot-reloaded** on every message (no restart needed) — so Claude Code itself can create or modify hooks at runtime.

```js
// .telegrapp/hooks/context.mjs
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
| _(empty)_ | `<project-cwd>/.telegrapp/users` |
| `~` | `<config-dir>/.telegrapp/<slug>/data` |
| Relative path (e.g. `.mydata`) | `<project-cwd>/<value>` |
| Absolute path | Used as-is |

### Log Files

When `logging.persist: true`, logs are written to:
```
<config-dir>/.telegrapp/<project-slug>/logs/YYYY-MM-DD.txt
```

## Directory Structure

With a config at `~/workspace/.telegrapp/config.json`:

```
~/workspace/
├── .telegrapp/
│   ├── config.json
│   ├── config.local.json    (gitignored — local overrides / secrets)
│   ├── hooks/
│   │   └── context.mjs            (global context hook, optional)
│   ├── commands/
│   │   └── mycommand.mjs          (global command, available to all projects)
│   ├── backend/
│   │   └── logs/
│   │       └── 2026-02-26.txt     (when persist: true)
│   └── frontend/
│       └── logs/
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
│   └── .telegrapp/
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
    └── .telegrapp/
        └── users/
```

## CLI Commands

```bash
# Show help
npx telegrapp --help

# Initialize config file
npx telegrapp init
npx telegrapp init --cwd ./workspace

# Start all bots
npx telegrapp
npx telegrapp --cwd ./workspace
```

## Bot Commands

| Command  | Description                |
|----------|----------------------------|
| `/start` | Welcome message            |
| `/help`  | Show help information      |
| `/clear` | Clear conversation history |

## Custom Commands

You can add your own slash commands as `.mjs` files. When a user sends `/mycommand`, the bot looks for a matching file before passing the message to Claude.

### File locations

| Location | Scope |
|----------|-------|
| `{project.cwd}/.telegrapp/commands/<name>.mjs` | Project-specific |
| `{configDir}/.telegrapp/commands/<name>.mjs` | Global — available to all projects |

Project-specific commands take precedence over global ones on name collision.

### Command file format

```js
// .telegrapp/commands/deploy.mjs
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

#### `ctx: Record<string, string>`

The fully-resolved context that would be sent to the AI for this message — identical to what Claude sees in its `# Context` header. Includes all implicit keys plus any config vars and hook results:

| Key group | Description |
|-----------|-------------|
| `bot.*` | `bot.userId`, `bot.username`, `bot.firstName`, `bot.chatId`, `bot.messageId`, `bot.timestamp`, `bot.datetime`, `bot.messageType` |
| `sys.*` | `sys.date`, `sys.time`, `sys.datetime`, `sys.ts`, `sys.tz` |
| `project.*` | `project.name`, `project.cwd`, `project.slug` |
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
  ): Promise<string>;
}
```

Unlike regular user messages, agent calls have no session history and no context header prepended — the prompt is sent to the engine as-is.

| Option | Type | Description |
|--------|------|-------------|
| `onProgress` | `(message: string) => void` | Called during execution with activity updates (e.g. `"Reading: /path/to/file"`). Use it to keep the user informed while the agent is working. |

Returns the agent's final text output as a string. Throws on failure — the bot's command error handler will catch it and reply with `Command failed: <message>`.

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

See [`examples/.telegrapp/commands/joke.mjs`](examples/.telegrapp/commands/joke.mjs) for a full example that combines `gram` for live status cycling with `agent.call` + `onProgress` for activity updates.

#### `projectCtx: ProjectContext`

The project-level context object. Useful fields:

| Field | Type | Description |
|-------|------|-------------|
| `projectCtx.config.name` | `string \| undefined` | Project name from config |
| `projectCtx.config.slug` | `string` | Internal slug (used for log/data paths) |
| `projectCtx.config.cwd` | `string` | Absolute path to the project directory |
| `projectCtx.config.configDir` | `string` | Absolute path to the directory containing `.telegrapp/config.json` |
| `projectCtx.config.dataDir` | `string` | Absolute path to user data storage root |
| `projectCtx.config.context` | `Record<string, string> \| undefined` | Raw config-level context values (pre-hook) |
| `projectCtx.logger` | Pino logger | Structured logger — use for debug output that ends up in log files |

### Examples

- [`examples/obsidian/.telegrapp/commands/status.mjs`](examples/obsidian/.telegrapp/commands/status.mjs) — project-specific command using `projectCtx.config`
- [`examples/.telegrapp/commands/context.mjs`](examples/.telegrapp/commands/context.mjs) — global command that dumps the full resolved context
- [`examples/.telegrapp/commands/joke.mjs`](examples/.telegrapp/commands/joke.mjs) — global command using `agent.call` with live status cycling and `onProgress` updates

### Skills

[Claude Code skills](https://docs.anthropic.com/en/docs/claude-code/skills) live in `.claude/skills/` inside the project directory. Each skill is a folder containing a `SKILL.md` file with a YAML frontmatter block and a prompt body:

```
<project-cwd>/
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
2. Appends any user arguments as `User input: <args>` if present
3. Calls the AI engine with that prompt via the engine-agnostic `agent.call()` interface
4. Sends the response back to the user

Skills can be **overridden per-project**: create a `.telegrapp/commands/<name>.mjs` file with the same name as the skill and the `.mjs` handler takes full precedence.

**Command precedence** (highest wins):

```
project .telegrapp/commands/<name>.mjs  >  global .telegrapp/commands/<name>.mjs  >  .claude/skills/<name>/
```

See [`examples/obsidian/.claude/skills/chuck/`](examples/obsidian/.claude/skills/chuck/SKILL.md) and [`examples/obsidian/.claude/skills/weather/`](examples/obsidian/.claude/skills/weather/SKILL.md) for example skills.


### Hot-reload

Commands and skills are **hot-reloaded** — drop a new `.mjs` file or `SKILL.md` into the relevant directory and the bot registers it with Telegram automatically, with no restart. This means Claude can write new command or skill files as part of a task and users see them in the `/` menu immediately.

## Creating a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Choose a display name (e.g. "My Backend Assistant")
4. Choose a username ending in `bot` (e.g. `my_backend_assistant_bot`)
5. Add the token to `.env.local` and reference it via `${VAR_NAME}` in `.telegrapp/config.json`

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

> **Note:** Named environment variable overrides from v1 (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`, etc.) are no longer supported. Use `${VAR_NAME}` substitution in `.telegrapp/config.json` instead — see [Environment variable substitution](#environment-variable-substitution).

## Security Notice

**Important**: Conversations with this bot are not end-to-end encrypted. Messages pass through Telegram's servers. Do not share:

- Passwords or API keys
- Personal identification numbers
- Financial information
- Confidential business data

This bot is intended for development assistance only. Treat all conversations as potentially visible to third parties.

## License

ISC
