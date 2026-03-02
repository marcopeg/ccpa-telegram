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

### Instruction files and precedence

Copilot supports **AGENTS.md** as the primary agent instruction file. It also supports GitHub’s own instruction layers: repository-wide (`.github/copilot-instructions.md`) and path-specific (`.github/instructions/*.instructions.md`).

**Agent instructions (one wins per context):** For the coding agent, **the nearest `AGENTS.md` in the directory tree** is used. Alternatively you can use a **single** `CLAUDE.md` or `GEMINI.md` in the **repository root** (not nested). So: either one nearest AGENTS.md, or one root CLAUDE.md/GEMINI.md — not both agent formats at once for the same scope.

**Chain with GitHub instructions:** When both repository-wide and path-specific instructions exist, **both are used**: repository-wide first, then path-specific instructions are appended when their globs match the files in context. Agent instructions (AGENTS.md or root CLAUDE.md/GEMINI.md) work **alongside** `.github/copilot-instructions.md` — all applicable layers are combined. So: `.github/copilot-instructions.md` + matching `.github/instructions/*.instructions.md` + (nearest AGENTS.md **or** root CLAUDE.md **or** root GEMINI.md).

**If both AGENTS.md and .github/copilot-instructions.md exist:** Both are loaded and combined; Copilot uses repository-wide instructions and the nearest agent instruction file together.

See [Adding repository custom instructions for GitHub Copilot](https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot).

```json
{ "engine": { "name": "copilot", "model": "claude-sonnet-4.6", "session": true } }
```

[← Back to engines index](../README.md)
