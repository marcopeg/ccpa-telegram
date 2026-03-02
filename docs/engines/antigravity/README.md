# Antigravity (Gemini CLI)

| | |
|---|---|
| **Home** | [antigravity.google](https://antigravity.google/) (IDE) · [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli) |
| **Engine name** | `antigravity` |
| **CLI command** | `gemini` |
| **Instructions file** | `GEMINI.md` |
| **Skills directory** | `.agent/skills/` |

[Google Antigravity](https://antigravity.google/) is an agent-first IDE (VS Code fork). It does not expose its own headless CLI — the terminal counterpart is [Gemini CLI](https://github.com/google-gemini/gemini-cli), Google’s open-source terminal AI agent that shares the same skills/rules ecosystem.

**Install and authenticate:**

```bash
# Install via npm (requires Node.js 18+)
npm install -g @google/gemini-cli

# Or run without installing
npx @google/gemini-cli

# Authenticate (opens browser sign-in on first run)
gemini
```

Free-tier access with a personal Google account (Gemini 2.5 Pro, 60 req/min, 1000 req/day). Also supports Google AI Studio or Vertex AI keys for higher limits.

**HAL usage:**

- **Config:** `engine.name: "antigravity"`. Optional: `engine.command`, `engine.model` (e.g. `gemini-2.5-pro`, passed as `--model`; default: `auto`), `engine.session`, `engine.sessionMsg`, and the flags under `engine.antigravity` (see table below).
- **Invocation:** `gemini -p <prompt> --output-format stream-json --approval-mode <mode> [--model <m>] [--resume <sessionId>] [--sandbox]`
- **Sessions:** When `engine.session` is `true`, the CLI is invoked with `--resume {sessionId}`. HAL stores and passes a session ID per Telegram user, so each user has their own conversation thread. `/clean` clears the stored session and replies with a static message (no engine call — same as Claude).
- **Streaming:** JSONL output with live progress from tool-use events.
- **Project files:** `GEMINI.md`, `.agent/skills/`.

**Antigravity-specific config:**

| Field | Description | Default |
|-------|-------------|---------|
| `antigravity.approvalMode` | Tool approval policy: `default`, `auto_edit`, or `yolo` | `"yolo"` |
| `antigravity.sandbox` | Run in containerized/seatbelt sandbox | `false` |

`approvalMode` defaults to `yolo` because HAL runs non-interactively — `default` and `auto_edit` would cause hangs or policy denials in headless mode.

```json
{
  "engine": {
    "name": "antigravity",
    "model": "gemini-2.5-pro",
    "antigravity": { "approvalMode": "yolo", "sandbox": false }
  }
}
```

### Instruction files and precedence

Gemini CLI (Antigravity engine) uses **GEMINI.md** by default as the root instruction file. You can configure **AGENTS.md** (and other names) via `context.fileName` in `settings.json`, e.g. `["AGENTS.md", "CONTEXT.md", "GEMINI.md"]`, so it can follow the AGENTS.md convention.

**Chain of instructions:** Yes. Multiple context files are discovered and **concatenated** (all are merged and sent with every prompt):

1. **Global:** `~/.gemini/GEMINI.md` (or first matching name from `context.fileName`).  
2. **Project root and ancestors:** From the current directory **up** to the project root (directory containing `.git`), the CLI looks for the context file (e.g. GEMINI.md or AGENTS.md) in each directory.  
3. **Subdirectories:** Context files in subdirectories **below** the cwd are also scanned (respecting `.gitignore` and `.geminiignore`) and included.

**If both AGENTS.md and GEMINI.md exist:** With default config only GEMINI.md is sought. If `context.fileName` lists both (e.g. `["AGENTS.md", "GEMINI.md"]`), the order in the list and the hierarchy above determine which filenames are looked for; each directory can contribute at most one file per name. All found files are concatenated. So in a given directory you typically use one of the names, not both.

See [Provide Context with GEMINI.md Files](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html).

[← Back to engines index](../README.md)
