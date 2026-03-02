# Supported engines

HAL supports multiple AI coding CLIs. Each engine has its own install steps, config options, and project files. Set the engine globally or per-project in `hal.config.json` via `engine.name`.

**Root instructions and chains:** Each engine’s README has an *Instruction files and precedence* section: whether it uses AGENTS.md or a different root file (e.g. CLAUDE.md, GEMINI.md), whether multiple instruction files are merged or one wins, and what happens if both AGENTS.md and that engine’s native file (e.g. `.github/copilot-instructions.md`) exist. See the table below and the linked READMEs for details.

| Engine | Config name | Brief description |
|----------|-------------|-------------------|
| [Claude Code](claude/README.md) | `claude` | Anthropic’s Claude Code CLI. Instructions: `CLAUDE.md`. Skills: `.claude/skills/`. |
| [GitHub Copilot](copilot/README.md) | `copilot` | GitHub Copilot CLI. Instructions: `AGENTS.md`. Skills: `.agents/skills/`, `.github/skills/`, `.claude/skills/`. |
| [Codex](codex/README.md) | `codex` | OpenAI Codex CLI. Instructions: `AGENTS.md`. Skills: `.agents/skills/`. Permission flags for network/disk. |
| [OpenCode](opencode/README.md) | `opencode` | OpenCode CLI (multi-provider). Instructions: `AGENTS.md`. Stub: basic prompt/response, no streaming. |
| [Cursor](cursor/README.md) | `cursor` | Cursor Agent CLI (`agent`). Instructions: `AGENTS.md`. Skills: `.agents/skills/`, `.cursor/skills/`. |
| [Antigravity](antigravity/README.md) | `antigravity` | Gemini CLI (terminal counterpart to Google Antigravity IDE). Instructions: `GEMINI.md`. Skills: `.agent/skills/`. |

### Feature compatibility

| Feature | Claude | Copilot | Codex | OpenCode | Cursor | Antigravity |
|--------|:------:|:-------:|:-----:|:--------:|:------:|:------------:|
| **Instruction file** | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | `AGENTS.md` | `GEMINI.md` |
| **Main skills folder** | `.claude/skills/` | `.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.agents/skills/` | `.agent/skills/` |
| **Per-user session** | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Network access** | — | — | ✓ | — | — | — |
| **Full disk access** | — | — | ✓ | — | — | — |
| **YOLO mode** | — | — | ✓ | — | — | ✓ |
| **Streaming progress** | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |

**Per-user session:** When HAL runs with multiple Telegram users on the same project, only **Claude** and **Antigravity** scope the conversation to each user: HAL passes a stored session ID to the CLI (`--resume <id>`) and persists the ID returned by the engine. **Copilot**, **Codex**, **OpenCode**, and **Cursor** use a single “continue last session” (e.g. `--continue`, `resume --last`, `-c`) with no session ID; the “last” session is shared by all users of that project. The Copilot, Codex, and Cursor CLIs can support resume-by-ID in other modes, but HAL’s adapters do not use it today.

**Network / full disk / YOLO:** Only **Codex** exposes configurable permission flags in HAL (`engine.codex.networkAccess`, `fullDiskAccess`, `dangerouslyEnableYolo`). **Antigravity** supports `engine.antigravity.approvalMode` (e.g. `yolo`) and `sandbox`; default is `yolo` for headless use. Other engines either allow tool use by default or do not expose these knobs in HAL.

**Streaming progress:** **Claude** and **Antigravity** stream JSONL from the CLI, so HAL can show live progress in Telegram. The others buffer output and show a single “processing” style message until the reply is ready.

---

## Engine configuration (hal.config.json)

Set the engine globally or per-project in `hal.config.json`. The engine determines which AI coding CLI is invoked for each message.

### Engine selection

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

### Generic engine fields

The `engine` object supports the fields below. Engine-specific options (e.g. Codex permissions, Antigravity flags) are in the per-engine docs linked above.

| Field | Description | Default |
|-------|-------------|---------|
| `name` | Engine: `claude`, `copilot`, `codex`, `opencode`, `cursor`, `antigravity` | `"claude"` |
| `command` | Custom path to the CLI binary | _(engine name)_ |
| `model` | AI model override (omit for engine or HAL default; see [Model defaults](#model-defaults)) | _(per engine)_ |
| `session` | Use persistent sessions (`--resume` / `--continue`) | `true` |
| `sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |

**Per-engine setup and options:** [Claude](claude/README.md) · [Copilot](copilot/README.md) · [Codex](codex/README.md) · [OpenCode](opencode/README.md) · [Cursor](cursor/README.md) · [Antigravity](antigravity/README.md).

### Model list (`providers` key)

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

### Model defaults

When `engine.model` is omitted (neither in globals nor project config), behavior depends on the engine:

- **Engine default** — Codex, Copilot, Cursor, and Antigravity: HAL does not pass a model flag, so the CLI picks its own default (Cursor passes `--model auto`; Antigravity defaults to `auto`).
- **HAL default** — Claude Code and OpenCode: HAL passes a built-in default so the engine always receives a model. Defaults are defined in `src/default-models.ts`:
  - Claude Code: `default` (account-recommended model)
  - OpenCode: `opencode/gpt-5-nano` (free Zen model)

To change HAL defaults, edit `src/default-models.ts`.

---

For other configuration (context, commands, logging, etc.), see [Configuration](../config/README.md).
