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
- [Project crons](./project/README.md) — per-project scheduled tasks defined in `{projectCwd}/.hal/crons/`
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

Every execution is written to the **centralised log directory** under `{configDir}/.hal/logs/crons/`:

```
{configDir}/.hal/logs/crons/
  system/{name}.{type}/{timestamp}.{name}.txt
  projects/{slug}/{name}.{type}/{timestamp}.{name}.txt
```

Log files are plain text and contain the job name, source file, start/end timestamps, full output, and exit status.

## Scheduling formats

The `schedule` field and `runAt` field accept four formats. See the [scheduling reference](./scheduling/README.md) for the complete guide.

| Format | Example | Behaviour |
|--------|---------|-----------|
| Cron expression | `"0 9 * * *"` | Recurring, calendar-aligned |
| Relative recurring | `"5m"` or `"+5m"` | Fire after delay, repeat after each execution completes |
| Relative single-shot | `"!30s"` | Fire once after delay |
| Absolute one-off | `runAt: "2026-06-01T09:00:00Z"` | Fire once at the given UTC time |

Use `scheduleStarts` to delay when a job becomes active (relative duration or ISO 8601 datetime). Use `scheduleEnds` to stop a recurring job after a deadline. See [scheduleStarts](./scheduling/README.md#schedulestarts--delay-before-start) and [scheduleEnds](./scheduling/README.md#scheduleends--expiry-for-recurring-jobs).
