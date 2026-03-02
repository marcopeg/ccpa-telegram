<p align="center">
  <img src="https://raw.githubusercontent.com/marcopeg/hal/main/images/hal.jpg" alt="HAL 9000" width="120" />
</p>

<h1 align="center">HAL</h1>

A Telegram bot that provides access to AI coding agents as a personal assistant. Run multiple engines (Claude Code, GitHub Copilot, and more) across multiple projects simultaneously, each with its own dedicated Telegram bot.

## Features

- Chat with your AI coding agent via Telegram
- Send images and documents for analysis
- **Voice message support** with local Whisper transcription
- **File sending** — the engine can send files back to you
- **Multi-engine support** — use Claude Code, GitHub Copilot, Codex, OpenCode, or Antigravity per project
- **Multi-project support** — run multiple bots from a single config, each connected to a different independent directory
- **Context injection** — every message includes system metadata (timestamps, user info, custom values) and supports custom injections via config and per-project hooks (`.mjs`) with hot-reload
- **Custom slash commands** — add `.mjs` command files per-project or globally; hot-reloaded so the engine can create new commands at runtime
- **Skills** — `.agents/skills/` entries are automatically exposed as Telegram slash commands; no extra setup needed
- Persistent conversation sessions per user (availability based on engine)
- Per-project access control, rate limiting, and logging

## How It Works

This tool runs one AI coding agent subprocess per project, each in its configured working directory. You can choose your [favourite engine](./docs/engines/README.md) globally, or each project can use a different engine.

The engine reads its standard config files from the project directory:

- `AGENTS.md` — Project-specific instructions and context (filename may depend on engine)
- `.agents/skills/` — Custom skills and slash commands (pattern may depend on engine)
- `.claude/settings.json` — Permissions and tool settings (Claude Code)
- `.mcp.json` — MCP server configurations

You get the full power of your chosen AI coding agent — file access, code execution, configured MCP tools — all accessible through Telegram.

## Prerequisites

- Node.js 18+
- At least one supported AI coding CLI installed and authenticated - see [engines](docs/engines/README.md)
- A Telegram bot token per project (from [@BotFather](https://t.me/BotFather)) — see [Telegram](docs/telegram/README.md#creating-a-telegram-bot)
- **ffmpeg** (required for voice messages) — `brew install ffmpeg` on macOS

## Supported Engines 🤖

This is the list of the currently supported engines (Claude Code, Copilot, Codex, OpenCode, Cursor, Antigravity):

- [OpenCode](docs/engines/opencode/README.md)
- [Codex](docs/engines/codex/README.md)
- [Claude Code](docs/engines/claude/README.md)
- [Copilot](docs/engines/copilot/README.md)
- [Cursor](docs/engines/cursor/README.md)
- [Antigravity](docs/engines/antigravity/README.md)

Each engine has pros/cons and some limitations.  
Here we try to keep updated a feature comparison table:

| Feature | [OpenCode](docs/engines/opencode/README.md) | [Codex](docs/engines/codex/README.md) | [Claude Code](docs/engines/claude/README.md) | [Copilot](docs/engines/copilot/README.md) | [Cursor](docs/engines/cursor/README.md) | [Antigravity](docs/engines/antigravity/README.md) |
|--------|:--------:|:-----:|:------:|:-------:|:------:|:------------:|
| **Instruction file** | `AGENTS.md` | `AGENTS.md` | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` | `GEMINI.md` |
| **Main skills folder** | `.agents/skills/` | `.agents/skills/` | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` | `.agent/skills/` |
| **Per-user session** | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |
| **Network access** | — | ✓ | — | — | — | — |
| **Full disk access** | — | ✓ | — | — | — | — |
| **YOLO mode** | — | ✓ | — | — | — | ✓ |
| **Streaming progress** | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ |

Read more in the [engine docs](docs/engines/README.md).

## Quick Start

```bash
# Create hal.config.json in the current directory
npx @marcopeg/hal init

# Or in a specific folder (config and bots will use that directory)
npx @marcopeg/hal init --cwd ./workspace

# Optional: pick engine at init
npx @marcopeg/hal init --engine copilot
npx @marcopeg/hal init --cwd ./workspace --engine copilot

# Edit hal.config.json: add your bot token and project path, then start
npx @marcopeg/hal
npx @marcopeg/hal --cwd ./workspace
```

## Telegram

Before running HAL you need a Telegram bot token and your own Telegram user ID. Both are required to set up your first project.

- **[Register a bot](docs/telegram/README.md#creating-a-telegram-bot)** — Get a bot token from BotFather and add it to your config.
- **[Find your user ID](docs/telegram/README.md#finding-your-telegram-user-id)** — Get your numeric user ID and add it to `allowedUserIds`.

## Configuration

HAL is configured via a config file in the directory where you run the CLI. Three formats are supported — JSON, [JSONC](https://code.visualstudio.com/docs/languages/json#_json-with-comments) (JSON with comments and trailing commas), and YAML. Only one format per file is allowed. Full reference:

- **[Configuration](docs/config/README.md)** — config files, env vars, `globals`, `projects[]`, dataDir, log files, directory structure
- **[Context](docs/config/context/README.md)** — context injection (implicit keys, custom context, hooks)
- **[Commands](docs/config/commands/README.md)** — built-in command config (`/start`, `/help`, `/reset`, `/clean`, `/model`, `/git`)
- **[Engines](docs/engines/README.md)** — supported engines, engine config, model list, model defaults, per-engine setup
- **[Logging](docs/config/logging/README.md)** — log level, flow, persist, log file paths
- **[Rate limit](docs/config/rate-limit/README.md)** — max messages per user per time window

<details>
<summary>Minimal config example (JSON)</summary>

Create a `hal.config.json` in your workspace. Use `${VAR_NAME}` for secrets and set them in `.env.local`.

```json
{
  "globals": {
    "engine": { "name": "claude" },
    "logging": { "level": "info", "flow": true, "persist": false },
    "rateLimit": { "max": 10, "windowMs": 60000 },
    "access": { "allowedUserIds": [123456789] }
  },
  "projects": [
    {
      "name": "backend",
      "cwd": "./backend",
      "telegram": { "botToken": "${BACKEND_BOT_TOKEN}" },
      "logging": { "persist": true }
    },
    {
      "name": "frontend",
      "cwd": "./frontend",
      "engine": { "name": "copilot", "model": "gpt-5-mini" },
      "telegram": { "botToken": "${FRONTEND_BOT_TOKEN}" }
    }
  ]
}
```

</details>

<details>
<summary>JSONC config example (with comments and trailing commas)</summary>

Use `hal.config.jsonc` to add inline comments and trailing commas. See [`examples/hal.config.jsonc`](examples/hal.config.jsonc) for a full example.

```jsonc
{
  // Global settings shared across all projects
  "globals": {
    "engine": {
      "name": "claude",  // claude, copilot, codex, opencode, cursor, antigravity
      "session": true,
    },
    "access": { "allowedUserIds": [123456789] },
    /* Rate limiting (per-user)
    "rateLimit": { "max": 10, "windowMs": 60000 },
    */
  },
  "projects": [
    {
      "name": "my-project",
      "cwd": "./my-project",
      "telegram": { "botToken": "${MY_BOT_TOKEN}" },
    },
  ],
}
```

</details>

## Bot Commands

| Command  | Description                                           |
|----------|-------------------------------------------------------|
| `/start` | Welcome message                                       |
| `/help`  | Show help information                                 |
| `/reset` | Wipes out all user data and resets the LLM session    |
| `/clean` | Resets the LLM session                                |

## Custom commands and skills

Add your own slash commands as `.mjs` files (project or global), or use engine skill folders that HAL exposes as commands. Custom commands can override a skill with the same name. Both are hot-reloaded.

- **[Custom commands](docs/custom-commands/README.md)** — file locations, handler arguments (`args`, `ctx`, `gram`, `agent`, `projectCtx`), examples.
- **[Skills](docs/skills/README.md)** — SKILL.md format, per-engine directories, precedence.

## Voice messages

Voice messages are transcribed locally with [Whisper](https://github.com/openai/whisper) (no audio sent to external services). **[Voice messages](docs/voice/README.md)** — setup (ffmpeg, CMake, nodejs-whisper), model options.

## Sending Files to Users

The engine can send files back through Telegram. Each user has a `downloads/` folder under their data directory. The engine is informed of this path in every prompt.

1. The engine writes a file to the downloads folder
2. The bot detects it after the engine's response completes
3. The file is sent via Telegram (as a document)
4. The file is deleted from the server after delivery

## Security Notice

**Important**: Conversations with this bot are not end-to-end encrypted. Messages pass through Telegram's servers. Do not share:

- Passwords or API keys
- Personal identification numbers
- Financial information
- Confidential business data

This bot is intended for development assistance only. Treat all conversations as potentially visible to third parties.

## License

MIT

---

This project is forked by the CCP at Telegram.
