# Skills

Skills follow the [Agent Skills standard](https://agentskills.io/). Each engine looks for skills in engine-specific directories (highest priority first). HAL reads them at boot and whenever `SKILL.md` files change. Skills are available to the engine, but only those with `telegram: true` are exposed as Telegram slash commands.

## Per-engine skill directories

| Engine       | Skill directories (priority order)                     |
|--------------|--------------------------------------------------------|
| Claude       | `.claude/skills`                                       |
| Codex        | `.agents/skills`                                       |
| Copilot      | `.agents/skills`, `.github/skills`, `.claude/skills`   |
| OpenCode     | `.agents/skills`, `.opencode/skills`, `.claude/skills` |
| Cursor       | `.agents/skills`, `.cursor/skills`                     |
| Antigravity  | `.agent/skills`                                        |

When the same skill name exists in multiple directories, the highest-priority directory wins (first-found).

## Structure

Each skill is a **folder** containing a `SKILL.md` file with a YAML frontmatter block and a prompt body:

```
{project-cwd}/
└── .agents/skills/       # or .claude/skills/, .github/skills/, etc.
    └── chuck/
        └── SKILL.md
```

## SKILL.md format

```markdown
---
name: chuck
description: Tells a joke about Chuck Norris.
telegram: true
---

Tell a short, funny joke about Chuck Norris.
```

- **Folder name** is used as the command name. If the frontmatter `name` field differs from the folder name, the bot logs a warning and uses the folder name.
- The **body** is the prompt sent to the AI when the user invokes the skill.

## Exposing skills to Telegram

By default, skills are **not** exposed as Telegram slash commands. To make a skill available in Telegram (in the `/help` menu and via direct invocation), you must add `telegram: true` to its YAML frontmatter. The `telegram: true` flag is case-insensitive.

## How invocation works

When a user invokes a skill command (e.g. `/chuck`):

1. The bot reads the `SKILL.md` prompt body
2. Appends any user arguments as `User input: {args}` if present
3. Calls the AI engine with that prompt via the engine-agnostic `agent.call()` interface
4. Sends the response back to the user

## Overriding a skill with a custom command

You can replace a skill with your own handler: create a [custom command](../custom-commands/README.md) `.hal/commands/{name}.mjs` with the same name as the skill. The `.mjs` handler takes full precedence.

**Command precedence** (highest wins):

```
project .hal/commands/{name}.mjs  >  global .hal/commands/{name}.mjs  >  engine skills (see table above)
```

## Examples

- [examples/obsidian/.claude/skills/chuck/](../../examples/obsidian/.claude/skills/chuck/SKILL.md)
- [examples/obsidian/.claude/skills/weather/](../../examples/obsidian/.claude/skills/weather/SKILL.md)

## See also

- [Custom commands](../custom-commands/README.md) — `.mjs` slash commands; can override a skill by using the same name.
- [Agent Skills standard](https://agentskills.io/) — external spec. Per-engine directories are summarized in [Engines](../engines/README.md).
