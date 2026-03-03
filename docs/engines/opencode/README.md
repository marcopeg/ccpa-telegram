# OpenCode

| | |
|---|---|
| **Home** | [opencode.ai](https://opencode.ai/) · [GitHub](https://github.com/opencode-ai/opencode) |
| **Engine name** | `opencode` |
| **CLI command** | `opencode` |
| **Instructions file** | `AGENTS.md` |
| **Skills directory** | `.agents/skills/`, `.opencode/skills/`, `.claude/skills/` |

**Install and authenticate:**

```bash
# Install via the official script
curl -fsSL https://opencode.ai/install | bash

# Or via npm / Homebrew / Scoop
npm install -g opencode
brew install opencode

# Authenticate (configure provider API keys)
opencode auth login
```

Supports 75+ LLM providers. Credentials are stored in `~/.local/share/opencode/auth.json`.

**HAL usage:**

- **Config:** `engine.name: "opencode"`. Optional: `engine.command`, `engine.model` (e.g. `opencode/gpt-5-nano`), `engine.session`, `engine.sessionMsg`.
- **Invocation:** `opencode run [-m <model>] [-c] <prompt>` with `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=true` env var.
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `-c` (continue). HAL does not pass a session ID; the session is **shared by all users** of the project. `/clean` sends `engine.sessionMsg` without `-c` to start a fresh session; the engine’s reply is sent to the user.
- **Note:** OpenCode is a basic prompt/response adapter — no streaming progress events.
- **Project file:** `AGENTS.md`.

## Available models

> **Last updated:** 2026-03-03 — [source](https://opencode.ai/docs/zen)

OpenCode uses the `provider/model` format. The models below use [OpenCode Zen](https://opencode.ai/docs/zen) (`opencode/` prefix). You can also use direct provider models (e.g. `anthropic/claude-opus-4-6`, `openai/gpt-5.2`).

**OpenAI (via Zen):**

| Model | Description |
|-------|-------------|
| `opencode/gpt-5.3-codex` | GPT-5.3 Codex — most capable |
| `opencode/gpt-5.2-codex` | GPT-5.2 Codex — intelligent agentic coding |
| `opencode/gpt-5.2` | GPT-5.2 — general agentic |
| `opencode/gpt-5.1-codex` | GPT-5.1 Codex |
| `opencode/gpt-5.1-codex-max` | GPT-5.1 Codex Max — long-running tasks |
| `opencode/gpt-5.1-codex-mini` | GPT-5.1 Codex Mini — cost-effective |
| `opencode/gpt-5.1` | GPT-5.1 |
| `opencode/gpt-5-codex` | GPT-5 Codex |
| `opencode/gpt-5` | GPT-5 |
| `opencode/gpt-5-nano` | GPT-5 Nano — free |

**Anthropic (via Zen):**

| Model | Description |
|-------|-------------|
| `opencode/claude-opus-4-6` | Claude Opus 4.6 — most intelligent |
| `opencode/claude-sonnet-4-6` | Claude Sonnet 4.6 — balanced |
| `opencode/claude-sonnet-4-5` | Claude Sonnet 4.5 |
| `opencode/claude-opus-4-5` | Claude Opus 4.5 |
| `opencode/claude-haiku-4-5` | Claude Haiku 4.5 — fast |

**Google (via Zen):**

| Model | Description |
|-------|-------------|
| `opencode/gemini-3.1-pro` | Gemini 3.1 Pro |
| `opencode/gemini-3-pro` | Gemini 3 Pro |
| `opencode/gemini-3-flash` | Gemini 3 Flash — fast |

**Other (via Zen):**

| Model | Description |
|-------|-------------|
| `opencode/minimax-m2.5` | MiniMax M2.5 |
| `opencode/kimi-k2.5` | Kimi K2.5 |
| `opencode/glm-5` | GLM 5 |
| `opencode/big-pickle` | Big Pickle — free (stealth preview) |

### Instruction files and precedence

OpenCode uses **AGENTS.md** as the main instruction file. It also supports **CLAUDE.md** as a fallback for Claude Code compatibility. There is **no** merging of multiple instruction files from the same category — **first match wins** per category.

**Lookup order (first matching file wins in each category):**  
1. **Claude Code global:** `~/.claude/CLAUDE.md` (unless disabled via `OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1`).  
2. **OpenCode global:** `~/.config/opencode/AGENTS.md`.  
3. **Local:** Traverse **up** from the current directory; look for `AGENTS.md`, then `CLAUDE.md`. The **first** file found (e.g. first AGENTS.md or CLAUDE.md on the path) is used.

**If both AGENTS.md and CLAUDE.md exist in the same directory:** Only **AGENTS.md** is used; CLAUDE.md is ignored in that directory.

**Custom instructions** in `opencode.json` (e.g. `instructions` field) are **combined** with the chosen AGENTS.md/CLAUDE.md file. So you get one “rules file” from the precedence above, plus any files referenced in config. See [Rules - AGENTS.md Project Guidelines](https://open-code.ai/docs/en/rules).

```json
{ "engine": { "name": "opencode", "model": "opencode/gpt-5-nano" } }
```

[← Back to engines index](../README.md)
