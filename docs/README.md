# Documentation

Index of HAL documentation. The repository root [README](../README.md) is the quick start and marketing overview; this folder holds the full, structured docs.

## Contents

| Section | Description |
|---------|-------------|
| [Setup wizard](setup-wizard/README.md) | Interactive config creation and completion; when it runs (explicit `wiz` or auto on `start`), pre-fill flags, `--reset`. |
| [Development](development/README.md) | Local setup, requirements, running the bot (examples folder, `.env`), release and publish flow, npm token setup. |
| [Configuration](config/README.md) | Config files, [reference.yaml](config/reference.yaml) (all keys), env vars, globals, projects, [session](config/session/README.md), context, commands, logging, rate limit. |
| [Engines](engines/README.md) | Supported engines, engine config, model list, model defaults, per-engine setup and install. |
| [Custom commands](custom-commands/README.md) | Add `.mjs` slash commands (file locations, handler args, examples, hot-reload). |
| [Skills](skills/README.md) | Engine skill folders as slash commands (SKILL.md format, precedence, overrides). |
| [Telegram](telegram/README.md) | Creating a bot with BotFather, finding your user ID. |
| [Voice messages](voice/README.md) | Local Whisper transcription (setup, ffmpeg, models). |
