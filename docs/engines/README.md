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

For generic engine config (e.g. `session`, `sessionMsg`, model list, model defaults), see the [Configuration](../../README.md#configuration) section in the main README (or the config docs when available).
