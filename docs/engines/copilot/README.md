# GitHub Copilot

| | |
|---|---|
| **Home** | [github.com/features/copilot/cli](https://github.com/features/copilot/cli) · [GitHub](https://github.com/github/copilot-cli) |
| **Engine name** | `copilot` |
| **CLI command** | `copilot` |
| **Instructions file** | `AGENTS.md` |
| **Skills directory** | `.agents/skills/`, `.github/skills/`, `.claude/skills/` |

**Install and authenticate:**

```bash
# Install via npm (requires Node.js 22+)
npm install -g @github/copilot

# Or via Homebrew
brew install --cask copilot-cli

# Authenticate (interactive — follow the prompts)
copilot
# Then use /login inside the CLI
```

Requires a Copilot Pro, Pro+, Business, or Enterprise plan. You can also authenticate via a fine-grained personal access token with the "Copilot Requests" permission, using the `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` environment variable.

**HAL usage:**

- **Config:** `engine.name: "copilot"`. Optional: `engine.command`, `engine.model`, `engine.session`, `engine.sessionMsg`.
- **Invocation:** `copilot -p <prompt> --allow-all [--model <m>] [--continue]`
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `--continue` (most recent session). HAL does not pass a session ID; the session is **shared by all users** of the project. `/clean` sends `engine.sessionMsg` to the engine without `--continue` to start a fresh session; the engine’s reply is sent to the user.
- **Project file:** `AGENTS.md`.

## Available models

> **Last updated:** 2026-03-03 — [source](https://docs.github.com/en/copilot/reference/ai-models/supported-models)

Models marked 0x are free (no premium requests on paid plans). Multiplier shown in parentheses.

**Anthropic:**

| Model | Description |
|-------|-------------|
| `claude-sonnet-4.6` | Claude 4.6 Sonnet — balanced performance |
| `claude-opus-4.6` | Claude 4.6 Opus — most capable (3x) |
| `claude-opus-4-6-fast` | Claude 4.6 Opus fast mode — preview (30x) |
| `claude-sonnet-4.5` | Claude 4.5 Sonnet |
| `claude-sonnet-4` | Claude 4 Sonnet |
| `claude-opus-4.5` | Claude 4.5 Opus (3x) |
| `claude-haiku-4.5` | Claude 4.5 Haiku — fast (0.33x) |

**OpenAI:**

| Model | Description |
|-------|-------------|
| `gpt-5.3-codex` | Latest Codex model |
| `gpt-5.2-codex` | GPT-5.2 Codex |
| `gpt-5.2` | GPT-5.2 general agentic |
| `gpt-5.1-codex-max` | GPT-5.1 Codex Max |
| `gpt-5.1-codex` | GPT-5.1 Codex |
| `gpt-5.1-codex-mini` | GPT-5.1 Codex Mini — preview (0.33x) |
| `gpt-5.1` | GPT-5.1 |
| `gpt-5-mini` | GPT-5 Mini — free (0x) |
| `gpt-4.1` | GPT-4.1 — free (0x) |

**Google:**

| Model | Description |
|-------|-------------|
| `gemini-3.1-pro` | Gemini 3.1 Pro — preview |
| `gemini-3-pro` | Gemini 3 Pro — preview |
| `gemini-3-flash` | Gemini 3 Flash — preview (0.33x) |
| `gemini-2.5-pro` | Gemini 2.5 Pro |

**Other:**

| Model | Description |
|-------|-------------|
| `grok-code-fast-1` | xAI Grok Code Fast 1 (0.25x) |
| `raptor-mini` | Fine-tuned GPT-5 Mini — preview |
| `goldeneye` | Fine-tuned GPT-5.1-Codex — preview |

### Instruction files and precedence

Copilot supports **AGENTS.md** as the primary agent instruction file. It also supports GitHub’s own instruction layers: repository-wide (`.github/copilot-instructions.md`) and path-specific (`.github/instructions/*.instructions.md`).

**Agent instructions (one wins per context):** For the coding agent, **the nearest `AGENTS.md` in the directory tree** is used. Alternatively you can use a **single** `CLAUDE.md` or `GEMINI.md` in the **repository root** (not nested). So: either one nearest AGENTS.md, or one root CLAUDE.md/GEMINI.md — not both agent formats at once for the same scope.

**Chain with GitHub instructions:** When both repository-wide and path-specific instructions exist, **both are used**: repository-wide first, then path-specific instructions are appended when their globs match the files in context. Agent instructions (AGENTS.md or root CLAUDE.md/GEMINI.md) work **alongside** `.github/copilot-instructions.md` — all applicable layers are combined. So: `.github/copilot-instructions.md` + matching `.github/instructions/*.instructions.md` + (nearest AGENTS.md **or** root CLAUDE.md **or** root GEMINI.md).

**If both AGENTS.md and .github/copilot-instructions.md exist:** Both are loaded and combined; Copilot uses repository-wide instructions and the nearest agent instruction file together.

See [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot).

```yaml
engine:
  name: copilot
  model: claude-sonnet-4.6
  session: true
```

[← Back to engines index](../README.md)
