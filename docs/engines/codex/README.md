# Codex

| | |
|---|---|
| **Home** | [developers.openai.com/codex](https://developers.openai.com/codex/cli/) · [GitHub](https://github.com/openai/codex) |
| **Engine name** | `codex` |
| **CLI command** | `codex` |
| **Instructions file** | `AGENTS.md` |
| **Skills directory** | `.agents/skills/` |

**Install and authenticate:**

```bash
# Install via npm
npm install -g @openai/codex

# Or via Homebrew
brew install --cask codex

# Authenticate (opens browser OAuth or prompts for API key)
codex
```

Requires a ChatGPT Plus, Pro, Business, Edu, or Enterprise plan — or an OpenAI API key. Credentials are stored in the system keychain.

**HAL usage:**

- **Config:** `engine.name: "codex"`. Optional: `engine.command`, `engine.model` (e.g. `gpt-5.1-codex-mini`), `engine.session`, `engine.sessionMsg`, and the permission flags under `engine.codex` (see table below).
- **Invocation:** `codex exec -p <prompt> --skip-git-repo-check [permission flags] [-m <model>]` or `codex exec resume --last` for session continuation.
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `codex exec resume --last` (most recent session). HAL does not pass a session ID; the session is **shared by all users** of the project. `/clean` sends `engine.sessionMsg` without resuming, so the engine starts a new session; the engine’s reply is sent to the user.
- **Permission flags:** HAL always passes `--skip-git-repo-check` so Codex runs without the trusted-directory check. You can escalate via `engine.codex`:

| Field | Description | Default |
|-------|-------------|---------|
| `codex.networkAccess` | Allow outbound network in shell commands | `false` |
| `codex.fullDiskAccess` | Unrestricted filesystem access (implies network) | `false` |
| `codex.dangerouslyEnableYolo` | Disable all sandboxing and approvals | `false` |

Higher tiers supersede lower ones. **Warning:** Use `dangerouslyEnableYolo` only in hardened environments (e.g. Docker, VMs).

- **Project file:** `AGENTS.md`.

## Available models

> **Last updated:** 2026-03-03 — [source](https://developers.openai.com/codex/models/)

Codex works with any model supporting the Responses API. These are the recommended models:

| Model | Description |
|-------|-------------|
| `gpt-5.3-codex` | Most capable Codex model (recommended) |
| `gpt-5.3-codex-spark` | Research preview — ChatGPT Pro only |
| `gpt-5.2-codex` | GPT-5.2 optimized for agentic coding |
| `gpt-5.2` | GPT-5.2 general agentic model |
| `gpt-5.1-codex` | GPT-5.1 Codex |
| `gpt-5.1-codex-max` | GPT-5.1 Codex Max — long-running tasks |
| `gpt-5.1-codex-mini` | GPT-5.1 Codex Mini — cost-effective |
| `gpt-5.1` | GPT-5.1 |
| `gpt-5-codex` | GPT-5 Codex |
| `gpt-5` | GPT-5 |
| `gpt-5-mini` | GPT-5 Mini — fast, cost-efficient |
| `gpt-5-nano` | GPT-5 Nano — fastest, cheapest |

### Instruction files and precedence

Codex uses **AGENTS.md** (and optionally **AGENTS.override.md**) as the root instruction format. It builds a **chain** of instructions that are **concatenated** (merged), not “one file wins”.

**Discovery order:**  
1. **Global:** In `~/.codex` (or `CODEX_HOME`), Codex reads `AGENTS.override.md` if present, otherwise `AGENTS.md`. Only one file at this level.  
2. **Project:** From the **project root** (usually Git root) **down** to the current working directory, Codex checks each directory for `AGENTS.override.md`, then `AGENTS.md`, then any names in `project_doc_fallback_filenames`. **At most one file per directory** is included.

**Merge behavior:** All chosen files are **concatenated** from root downward, joined with blank lines. Content from directories **closer to cwd** appears later, so it effectively overrides earlier guidance. Codex stops when total size reaches `project_doc_max_bytes` (default 32 KiB). Empty files are skipped.

**If both AGENTS.md and AGENTS.override.md exist in the same directory:** Only **AGENTS.override.md** is used in that directory (override wins). In subdirectories you can layer e.g. root `AGENTS.md` + `services/payments/AGENTS.override.md` for payment-specific rules.

See [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md).

```json
{
  "engine": {
    "name": "codex",
    "model": "gpt-5.1-codex-mini",
    "codex": { "networkAccess": true, "fullDiskAccess": true }
  }
}
```

[← Back to engines index](../README.md)
