# Engine and model configuration

Set the engine globally or per-project in `hal.config.json`. The engine determines which AI coding CLI is invoked for each message. **Per-engine setup, install, and options** (including permission flags) are in [Engines](../../engines/README.md); this page covers the generic engine fields, the model list, and model defaults.

## Engine selection

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

## Generic engine fields

The `engine` object supports the fields below. Engine-specific options (e.g. Codex permissions, Antigravity flags) are in the [engine docs](../../engines/README.md).

| Field | Description | Default |
|-------|-------------|---------|
| `name` | Engine: `claude`, `copilot`, `codex`, `opencode`, `cursor`, `antigravity` | `"claude"` |
| `command` | Custom path to the CLI binary | _(engine name)_ |
| `model` | AI model override (omit for engine or HAL default; see [Model defaults](#model-defaults)) | _(per engine)_ |
| `session` | Use persistent sessions (`--resume` / `--continue`) | `true` |
| `sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |

**Per-engine setup and options:** [Claude](../../engines/claude/README.md) · [Copilot](../../engines/copilot/README.md) · [Codex](../../engines/codex/README.md) · [OpenCode](../../engines/opencode/README.md) · [Cursor](../../engines/cursor/README.md) · [Antigravity](../../engines/antigravity/README.md).

## Model list (`providers` key)

The `providers` config lets you define which models are available for each engine in the `/model` Telegram command. Keys are engine names. Top-level under `globals`, or per-project to override.

```json
{
  "globals": {
    "providers": {
      "codex": [
        { "name": "gpt-5.3-codex", "description": "Most capable Codex model" },
        { "name": "gpt-5.2-codex", "description": "Advanced coding model" },
        { "name": "gpt-5.2", "description": "General agentic model" }
      ],
      "claude": [
        { "name": "claude-sonnet-4-6", "description": "Balanced performance and speed" },
        { "name": "claude-opus-4-6", "description": "Most capable, complex reasoning" }
      ]
    }
  }
}
```

Each entry has:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | The model identifier passed to the engine CLI (e.g. `gpt-5.3-codex`) |
| `description` | No | Short description shown in the Telegram model picker |

**Behavior of `/model`:**

- **With `providers` configured:** `/model` (no argument) shows a list of inline buttons for the configured models. `/model <name>` validates against the list before accepting.
- **Without `providers`:** `/model` (no argument) shows a helper message prompting the user to type `/model <name>`. `/model <name>` accepts any value.

**Available models per engine:** Refer to each engine's official documentation:

| Engine | Models reference |
|--------|----------------|
| Codex | <https://developers.openai.com/codex/models/> |
| Claude Code | <https://support.claude.com/en/articles/11940350-claude-code-model-configuration> |
| Cursor | <https://cursor.com/docs/models> |
| Copilot | <https://docs.github.com/en/copilot/reference/ai-models/supported-models> |
| OpenCode | <https://opencode.ai/docs/models/> |
| Antigravity | <https://antigravity.google/docs/models> |

## Model defaults

When `engine.model` is omitted (neither in globals nor project config), behavior depends on the engine:

- **Engine default** — Codex, Copilot, Cursor, and Antigravity: HAL does not pass a model flag, so the CLI picks its own default (Cursor passes `--model auto`; Antigravity defaults to `auto`).
- **HAL default** — Claude Code and OpenCode: HAL passes a built-in default so the engine always receives a model. Defaults are defined in `src/default-models.ts`:
  - Claude Code: `default` (account-recommended model)
  - OpenCode: `opencode/gpt-5-nano` (free Zen model)

To change HAL defaults, edit `src/default-models.ts`.

[← Back to Configuration](../README.md)
