# Cron jobs

HAL supports scheduled tasks (cron jobs) that run on a timer — either on a recurring schedule or once at a specific time. Jobs can run prompts against a project's AI engine, or execute arbitrary JavaScript programs with full access to the bot APIs.

Jobs are defined as files — either prompt-based Markdown (`.md`) or programmatic ES modules (`.mjs`) — and are loaded from well-known directories at each tier.

## Cron tiers

| Tier    | Directory                             | Who defines it | Mutable from chat |
|---------|---------------------------------------|----------------|-------------------|
| System  | `{configDir}/.hal/crons/`             | Operator       | No                |
| Project | `{projectCwd}/.hal/crons/`            | Developer      | No                |
| User    | `{dataDir}/{userId}/crons/`           | Bot user       | Yes               |

All tiers accept the same two file formats (`.md` and `.mjs`). All directories are hot-reloaded via file watchers — add, edit, or delete a file and the scheduler updates without a restart.

- [System crons](./system/README.md) — global scheduled tasks, available across all projects
- Project crons — _coming soon (032b)_
- User crons and `/cron_*` slash commands — _coming soon (032c)_

> **Crons are opt-in.** A job is only scheduled when `enabled: true` is explicitly set (frontmatter for `.md`, named export for `.mjs`). Omitting `enabled` or setting it to `false` loads and validates the file but never runs it — safe for committing draft crons to version control.

## File types

Both formats are first-class and intentionally separate. The scheduler selects the loader by file extension and runs the matching executor; `.md` files run prompt-based jobs and `.mjs` files run programmatic handlers. Use whichever format fits the job — they can coexist in the same directory without ambiguity.

### `.md` — Prompt-based

Sends a prompt to a project's AI engine on schedule. Defined by YAML frontmatter (scheduling, targets) and a Markdown prompt body.

```markdown
---
enabled: true
schedule: "0 9 * * *"
targets:
  - projectId: my-project
    userId: 123456789
    flowResult: true
---

Check git status and summarise what changed since yesterday.
```

### `.mjs` — Programmatic

Runs arbitrary JavaScript on schedule with full access to the Grammy Bot API. Defined by named ES module exports.

```js
export const enabled = true;
export const schedule = "*/15 * * * *";

export async function handler(ctx) {
  const { bot } = ctx.projects["my-project"];
  await bot.api.sendMessage(123456789, "Still running ✓");
}
```

## Execution logs

Every execution is logged to disk:

```
{tierRootDir}/.hal/logs/crons/{job-name}/{timestamp}.{job-name}.txt
```

Where `tierRootDir` is:
- **System:** `{configDir}`
- **Project:** `{projectCwd}`
- **User:** `{dataDir}/{userId}`

Log files are plain text and contain the job name, source file, start/end timestamps, full output, and exit status.

## One-off jobs

Use `runAt` instead of `schedule` for a job that runs once at a specific time:

```markdown
---
runAt: "2026-06-01T09:00:00Z"
targets:
  - projectId: my-project
---

Run the quarterly review checklist.
```

If `runAt` is in the past when the file is loaded, the job is silently skipped. Update `runAt` to a future date and the file watcher will re-arm it automatically.
