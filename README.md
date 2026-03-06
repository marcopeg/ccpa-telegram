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
# Create a config file in the current directory (init may create JSON; YAML is recommended)
npx @marcopeg/hal init

# Or in a specific folder (config and bots will use that directory)
npx @marcopeg/hal init --cwd ./workspace

# Optional: pick engine at init
npx @marcopeg/hal init --engine copilot
npx @marcopeg/hal init --cwd ./workspace --engine copilot

# Edit your config (e.g. hal.config.yaml): add your bot token and project path, then start
npx @marcopeg/hal
npx @marcopeg/hal --cwd ./workspace
```

## Telegram

Before running HAL you need a Telegram bot token and your own Telegram user ID. Both are required to set up your first project.

- **[Register a bot](docs/telegram/README.md#creating-a-telegram-bot)** — Get a bot token from BotFather and add it to your config.
- **[Find your user ID](docs/telegram/README.md#finding-your-telegram-user-id)** — Get your numeric user ID and add it to `allowedUserIds`.

## Configuration

HAL is configured via a config file in the directory where you run the CLI. **YAML** is the recommended format for examples and commented configs; JSON and JSONC are also supported. See [Configuration](docs/config/README.md) and [Configuration alternatives](docs/config/README.md#configuration-alternatives) for details. Full reference:

- **[Configuration](docs/config/README.md)** — config files, [reference.yaml](docs/config/reference.yaml) (all keys), [examples/hal.config.yaml](examples/hal.config.yaml), env vars, `globals`, `projects` (map), dataDir, log files
- **[Context](docs/config/context/README.md)** — context injection (implicit keys, custom context, hooks)
- **[Commands](docs/config/commands/README.md)** — built-in command config (`/start`, `/help`, `/reset`, `/clean`, `/model`, `/engine`, `/git`)
- **[Engines](docs/engines/README.md)** — supported engines, engine config, model list, model defaults, per-engine setup
- **[Logging](docs/config/logging/README.md)** — log level, flow, persist, log file paths
- **[Rate limit](docs/config/rate-limit/README.md)** — max messages per user per time window

<details>
<summary>Minimal config example (YAML)</summary>

Create a `hal.config.yaml` in your workspace (or use [examples/hal.config.yaml](examples/hal.config.yaml)). Use `${VAR_NAME}` for secrets and set them in `.env.local`. Full key reference: [docs/config/reference.yaml](docs/config/reference.yaml).

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

</details>

<details>
<summary>JSON and JSONC</summary>

JSON and JSONC are also supported alongside YAML. For a minimal JSON/JSONC example and supported JSONC features (comments, trailing commas), see [Configuration alternatives](docs/config/README.md#configuration-alternatives). Use the YAML [reference](docs/config/reference.yaml) or [example](examples/hal.config.yaml) and convert if needed.

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

## Releasing

Releases are handled by [release-it](https://github.com/release-it/release-it) with [conventional commits](https://www.conventionalcommits.org/): it bumps the version, updates `CHANGELOG.md` from the commit history, commits, tags, and publishes.

**Package manager:** This repo uses **pnpm** (see `packageManager` in `package.json`). You can use **npm** instead: install deps and run scripts with either. For releasing, `pnpm run deploy` and `npm run deploy` both work; the only requirement is Node 18+ and being logged in to the registry (`npm login`).

1. **Clean tree** — Commit or stash all changes. release-it will refuse to release if the working directory is dirty.
2. **Auth** — Run `npm login` if you are not already logged in.
3. **Release** — Either:
   - **Patch (one command):** `pnpm run deploy` or `npm run deploy` — non-interactive patch bump, changelog update, commit, tag, and publish.
   - **Interactive (choose patch/minor/major):** `pnpm run release` or `npm run release` — prompts for the version bump, then updates changelog, commits, tags, and publishes.

Config lives in [.release-it.json](.release-it.json) (conventional-commits preset, `CHANGELOG.md` at repo root, npm publish with `--access public`).

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
