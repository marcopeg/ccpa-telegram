# Supported engines

HAL supports multiple AI coding CLIs. Each engine has its own install steps, config options, and project files. Set the engine globally or per-project in your config file (e.g. `hal.config.yaml`) via `engine.name`.

**Root instructions and chains:** Each engine’s README has an *Instruction files and precedence* section: whether it uses AGENTS.md or a different root file (e.g. CLAUDE.md, GEMINI.md), whether multiple instruction files are merged or one wins, and what happens if both AGENTS.md and that engine’s native file (e.g. `.github/copilot-instructions.md`) exist. See the table below and the linked READMEs for details.

**`.agents` as the shared convention:** For any engine that supports the `.agents` convention, HAL uses `AGENTS.md` and `.agents/skills/` so you can keep a single shared set of instructions and skills across Copilot, Codex, OpenCode, and Cursor. **Claude Code does not support `.agents`**, so it still requires `CLAUDE.md` and `.claude/skills/`.

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

**Session configuration:** `engine.session` is one of: `false` (stateless), `true` (adapter default), `"shared"`, or `"user"`. See [Session configuration](../config/session/README.md). **Claude** default is per-user; `"shared"` forces `--continue`. **Antigravity** is per-user. **Codex** and **Cursor** default to shared; `"user"` enables experimental per-user. **OpenCode** and **Copilot** support only `true`/`"shared"`; `"user"` causes a **boot error**.

**Network / full disk / YOLO:** Only **Codex** exposes configurable permission flags in HAL (`engine.codex.networkAccess`, `fullDiskAccess`, `dangerouslyEnableYolo`). **Antigravity** supports `engine.antigravity.approvalMode` (e.g. `yolo`) and `sandbox`; default is `yolo` for headless use. Other engines either allow tool use by default or do not expose these knobs in HAL.

**Streaming progress:** **Claude** and **Antigravity** stream JSONL from the CLI, so HAL can show live progress in Telegram. The others buffer output and show a single “processing” style message until the reply is ready.

---

## Engine configuration

Set the engine globally or per-project in your config file. The engine determines which AI coding CLI is invoked for each message.

### Engine selection

```yaml
globals:
  engine:
    name: claude
projects:
  backend:
    cwd: ./backend
    telegram:
      botToken: "${BACKEND_BOT_TOKEN}"
  frontend:
    cwd: ./frontend
    engine:
      name: copilot
      model: gpt-5-mini
    telegram:
      botToken: "${FRONTEND_BOT_TOKEN}"
  legacy:
    active: false
    cwd: ./legacy
    telegram:
      botToken: "${LEGACY_BOT_TOKEN}"
```

In this example:

- **backend** inherits the global engine (Claude Code, default model)
- **frontend** uses GitHub Copilot with the `gpt-5-mini` model
- **legacy** is inactive and will be skipped at boot

### Generic engine fields

The `engine` object supports the fields below. Engine-specific options (e.g. Codex permissions, Antigravity flags) are in the per-engine docs linked above.

| Field | Description | Default |
|-------|-------------|---------|
| `name` | **Required.** Engine: `claude`, `copilot`, `codex`, `opencode`, `cursor`, `antigravity`. Must be set in globals or per-project; no default. | — |
| `command` | Custom path to the CLI binary | _(engine name)_ |
| `model` | AI model override (omit for engine or HAL default; see [Model defaults](#model-defaults)) | _(per engine)_ |
| `session` | Session mode: `false` \| `true` \| `"shared"` \| `"user"`. See [Session configuration](../config/session/README.md). `"user"` with OpenCode/Copilot fails at boot. | `true` |
| `sessionMsg` | Message sent when renewing session (e.g. `/clean`) | `"hi!"` |

**Per-engine setup and options:** [Claude](claude/README.md) · [Copilot](copilot/README.md) · [Codex](codex/README.md) · [OpenCode](opencode/README.md) · [Cursor](cursor/README.md) · [Antigravity](antigravity/README.md).

### Model list (`providers` key)

The `providers` config lets you define which models are available for each engine in the `/model` Telegram command. Keys are engine names. Top-level sibling of `globals` and `projects`, or per-project to override.

```yaml
providers:
  codex:
    - name: gpt-5.3-codex
      description: Most capable Codex model
    - name: gpt-5.2-codex
      description: Advanced coding model
    - name: gpt-5.2
      description: General agentic model
      default: true
  claude:
    - name: claude-sonnet-4-6
      description: Balanced performance and speed
    - name: claude-opus-4-6
      description: Most capable, complex reasoning
globals: {}
projects: {}
```

Each entry has:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | **Yes** | The model identifier passed to the engine CLI (e.g. `gpt-5.3-codex`) |
| `description` | No | Short description shown in the Telegram model picker |
| `default` | No | If `true`, this model is used when `engine.model` is not set (see [Model defaults](#model-defaults)). At most one model per `providers.<engine>` list may have `default: true`; otherwise HAL fails at boot with a `ConfigLoadError`. |

**Behavior of `/model`:**

- **With `providers` configured:** `/model` (no argument) shows a list of inline buttons for the configured models. `/model <name>` validates against the list before accepting.
- **Without `providers` (or empty list):** For OpenCode and Cursor, HAL can discover models from the CLI at runtime, so `/model` is still shown and the list is filled from the engine’s `models` command. For other engines, `/model` (no argument) prompts to type `/model <name>`; `/model <name>` accepts any value.
- **Auto-disable:** `/model` is hidden when the active engine has fewer than two models in its list **and** does not support self-discovery (OpenCode, Cursor).

**Behavior of `/engine`:**

The `/engine` command lets users switch the AI engine for a project. **Available engines** are exactly those that have a key under `providers` — even if the list is empty. So you can enable only specific engines for switching. This shape means: *enable only these engines, on default models; engines with auto-discovery (OpenCode, Cursor) get their model list from the CLI when the list is empty.*

```yaml
providers:
  opencode:    # empty = /engine shows opencode; /model uses CLI discovery (default models)
  codex:       # empty = /engine shows codex; /model hidden unless you add models
```

- `/engine` (no argument) shows the current engine and model, plus inline buttons for those engines that have a `providers` key.
- `/engine <name>` validates against that list and writes the change. Switching engines also **clears the model selection** (since models are engine-specific).
- **Project engine must be in the list:** When `providers` defines one or more engine keys, every project’s `engine.name` must be one of them. Otherwise HAL fails at boot with a clear error (e.g. *project "X" uses engine "opencode", but `providers` only allows: codex*).
- **Auto-disable:** When zero or one engines have a key in `providers`, `/engine` is hidden.
- **No `providers` key:** If the config has no `providers` key at all, HAL runs a fast CLI check at boot and builds an in-memory list of available engines; if more than one is available, `/engine` is enabled.
- **Empty `providers: {}`:** If the config has `providers:` but no engine keys listed, HAL does **not** run boot discovery. Engine and model switching are disabled (projects cannot change engine or model via `/engine` or `/model`).

See [Commands](../config/commands/README.md) for full `/model` and `/engine` configuration details.

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

The model used at runtime is chosen in this order:

1. **Explicit `engine.model`** — If set in project or globals, it always wins.
2. **Provider default** — If the resolved `providers.<engine>` list for the active engine has exactly one entry with `default: true`, that model’s `name` is used.
3. **HAL or engine default** — Otherwise HAL either passes a built-in default (see below) or omits the model so the CLI uses its own default.

When `engine.model` is omitted and no provider default is set, behavior depends on the engine:

- **Engine default** — Codex, Copilot, Cursor, OpenCode, and Antigravity: HAL does not pass a model flag when `engine.model` is omitted, so the CLI picks its own default (e.g. Cursor passes `--model auto`; OpenCode uses its CLI default such as Zen).
- **HAL default** — Claude Code only: HAL passes a built-in default so the engine always receives a model. Defaults are defined in `src/default-models.ts` (e.g. Claude Code: `default`).

**Provider default validation:** At most one model per `providers.<engine>` list (top-level or in any project) may have `default: true`. If two or more entries in the same list have `default: true`, HAL fails at boot with a clear `ConfigLoadError` naming the engine and list (e.g. `providers.codex` or `projects["my-project"].providers.claude`).

To change HAL defaults, edit `src/default-models.ts`.

---

For other configuration (context, commands, logging, etc.), see [Configuration](../config/README.md).
