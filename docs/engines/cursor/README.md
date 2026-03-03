# Cursor

| | |
|---|---|
| **Home** | [cursor.com/cli](https://cursor.com/cli) · [Docs](https://cursor.com/docs/cli/overview) |
| **Engine name** | `cursor` |
| **CLI command** | `agent` |
| **Instructions file** | `AGENTS.md` |
| **Skills directory** | `.agents/skills/`, `.cursor/skills/` |

**Install and authenticate:**

```bash
# Install
curl https://cursor.com/install -fsS | bash
# Ensure ~/.local/bin is on your $PATH

# Authenticate (for headless/CI use, set the API key env var)
export CURSOR_API_KEY=your-key-here
```

Requires a Cursor subscription. For headless mode, set `CURSOR_API_KEY` as an environment variable.

**HAL usage:**

- **Config:** `engine.name: "cursor"`. Optional: `engine.command`, `engine.model` (default: `auto`), `engine.session`, `engine.sessionMsg`.
- **Invocation:** `agent --print --workspace <cwd> --trust --force --model <m> [--continue] <prompt>`
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `--continue` (most recent session). HAL does not pass a session ID; the session is **shared by all users** of the project. `/clean` sends `engine.sessionMsg` without `--continue` to start a fresh session; the engine’s reply is sent to the user.
- **Project file:** `AGENTS.md`.

## Available models

> **Last updated:** 2026-03-03 — [source](https://cursor.com/docs/models)

GPT variants support reasoning effort suffixes (`-low`, `-high`, `-xhigh`) and speed suffixes (`-fast`).

**Cursor native:**

| Model | Description |
|-------|-------------|
| `auto` | Auto-selects best model for the task (default) |
| `composer-1.5` | Cursor's own agent model |
| `composer-1` | Cursor's legacy agent model |

**Anthropic:**

| Model | Description |
|-------|-------------|
| `sonnet-4.6` | Claude 4.6 Sonnet — balanced performance |
| `sonnet-4.6-thinking` | Claude 4.6 Sonnet with extended thinking |
| `opus-4.6` | Claude 4.6 Opus — most capable |
| `opus-4.6-thinking` | Claude 4.6 Opus with extended thinking |
| `sonnet-4.5` | Claude 4.5 Sonnet |
| `sonnet-4.5-thinking` | Claude 4.5 Sonnet with extended thinking |
| `opus-4.5` | Claude 4.5 Opus |
| `opus-4.5-thinking` | Claude 4.5 Opus with extended thinking |

**OpenAI:**

| Model | Description |
|-------|-------------|
| `gpt-5.3-codex` | Latest Codex (variants: -high, -low, -xhigh, -fast) |
| `gpt-5.2` | GPT-5.2 general agentic (variant: -high) |
| `gpt-5.2-codex` | GPT-5.2 Codex (variants: -high, -low, -xhigh, -fast) |
| `gpt-5.1-codex-max` | GPT-5.1 Codex Max (variant: -high) |
| `gpt-5.1-codex-mini` | GPT-5.1 Codex Mini — cost-effective |

**Google:**

| Model | Description |
|-------|-------------|
| `gemini-3.1-pro` | Gemini 3.1 Pro |
| `gemini-3-pro` | Gemini 3 Pro |
| `gemini-3-flash` | Gemini 3 Flash — fast and cheap |

**Other:**

| Model | Description |
|-------|-------------|
| `grok` | xAI Grok Code |
| `kimi-k2.5` | Moonshot Kimi K2.5 |

### Instruction files and precedence

Cursor supports **AGENTS.md** in the project root as a simple markdown instruction file. It also supports the **.cursor/rules/** system (`.md` or `.mdc` files with optional frontmatter for globs and when to apply). Both are loaded and **merged** into the model context; they are not mutually exclusive.

**Precedence (highest wins on conflict):** Team Rules (dashboard) → **Project Rules** (`.cursor/rules/*.mdc`) → User Rules (global settings) → legacy `.cursorrules` → **AGENTS.md**. So `.cursor/rules` content takes precedence over AGENTS.md when both exist.

**If both AGENTS.md and .cursor/rules exist:** Both are loaded and merged. Project rules (`.cursor/rules`) are applied with higher precedence than AGENTS.md. Cursor also reads **CLAUDE.md** automatically when present, so AGENTS.md and CLAUDE.md can both be used; exact merge order with .cursor/rules is per Cursor’s internal ordering above.

**Chain:** You can have a global `~/.codex/AGENTS.md` (or similar) for personal defaults; project-level AGENTS.md and .cursor/rules apply on top. See [Rules](https://cursor.com/docs/context/rules).

```json
{ "engine": { "name": "cursor", "model": "auto" } }
```

[← Back to engines index](../README.md)
