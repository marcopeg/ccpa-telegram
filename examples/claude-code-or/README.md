# Claude Code with OpenRouter — free models

Example project using the Claude Code adapter backed by [OpenRouter](https://openrouter.ai)
free models instead of the native Anthropic API. No Anthropic subscription required.

## How it works

| Setting | Value |
|---------|-------|
| Engine | `claude` (Claude Code CLI) |
| Backend | OpenRouter (`ANTHROPIC_BASE_URL`) |
| Model | `openrouter/free` (routes to the best available free model) |
| Auth | `ANTHROPIC_AUTH_TOKEN` sourced from `.env` via `engine.envFile` |

`.claude/settings.json` points the CLI at OpenRouter and clears the default API key so
the CLI uses `ANTHROPIC_AUTH_TOKEN` from the env file instead:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://openrouter.ai/api",
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_MODEL": "openrouter/free"
  }
}
```

## Setup

1. Get a free API key at <https://openrouter.ai/keys>.

2. Copy `.env.example` to `.env` and fill in your key:

   ```bash
   cp .env.example .env
   # edit .env and replace sk-or-v1-xxxxx with your real key
   ```

   `.env` is gitignored — your key stays local.

3. In `hal.config.yaml`, the project is already configured to source the env file
   before each Claude CLI invocation:

   ```yaml
   claude-code:
     engine:
       name: claude
       model: openrouter/free
       envFile: .env        # sourced into the engine child process
   ```

   HAL resolves `envFile` relative to the project `cwd`, so `.env` maps to this
   directory. The token is never part of the HAL config and never logged.

4. Start HAL normally. The startup log will confirm the env file is loaded:

   ```
   Configuration sourced:
     ...
     engine.envFile [claude-code]: /path/to/examples/claude-code-or/.env
   ```

## HAL capabilities

| Feature | Status |
|---------|--------|
| Per-user sessions | Yes — each Telegram user gets an isolated session |
| Session continuation | Yes — resumed via `--resume <sessionId>` |
| Streaming progress | Yes — live output forwarded to Telegram |

## Manual usage (without HAL)

```bash
source .env && claude
```

The reference video that explains the OpenRouter + Claude Code integration:
<https://youtu.be/p4KD56w2kpc?si=okz2jrKA346iscBT>
