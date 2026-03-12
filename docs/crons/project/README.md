# Project-tier crons

Project crons are scheduled tasks defined inside a project's own directory and scoped entirely to that project. Unlike system crons, they do not need to specify a `projectId` — the project is implicit.

→ See [Cron scheduling reference](../scheduling/README.md) for the full scheduling guide: cron expressions, `runAt`, relative recurring (`+Xs`), and relative single-shot (`!Xs`).

---

## Where files live

```
{projectCwd}/
  .hal/
    crons/
      morning-briefing.md    ← prompt-based cron
      health-check.mjs       ← programmatic cron
```

Files are loaded at bot startup and hot-reloaded when added, changed, or deleted.

---

## `.md` — Prompt-based crons

The file is a Markdown document with YAML frontmatter. The body is the prompt sent to the project's AI engine.

### Frontmatter fields

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `enabled` | boolean | no | `false` | Must be `true` to schedule. |
| `schedule` | string | one of | — | Schedule for the job. Accepts: cron expressions (`"0 9 * * *"`), relative recurring (`"+5m"`), relative single-shot (`"!30s"`). See [scheduling reference](../scheduling/README.md). |
| `runAt` | string | one of | — | ISO 8601 absolute datetime (one-off). |
| `scheduleStarts` | string | no | — | Delay scheduling until this point. Relative (`"20m"`) or ISO 8601 absolute. See [scheduleStarts](../scheduling/README.md#schedulestarts--delay-before-start). |
| `scheduleEnds` | string | no | — | Stop recurring executions after this point. Relative (`"20d"`) or ISO 8601 absolute. See [scheduling reference](../scheduling/README.md#scheduleends--expiry-for-recurring-jobs). |
| `runAs` | number | no | — | User ID: context injected as `bot.userId` AND receives the result via DM. |
| `notify` | number[] | no | — | Additional user IDs that receive the result via DM (no context injection). |

- Exactly one of `schedule` or `runAt` must be present.
- `runAs` and `notify` are both optional. Omitting both → silent run (log-only).
- `notify` can be used without `runAs` (broadcast without user context injection).

### `runAs` vs `notify`

| | Context injection | Receives result DM |
|---|---|---|
| `runAs` | ✓ (`bot.userId` set) | ✓ |
| `notify` entries | ✗ | ✓ |

When `runAs` is set, `bot.userId` is available in context vars (same as system-tier `targets[].userId`). No user data directory or session loading — that is 032c.

### Context injection

Before calling the engine, the prompt is wrapped with a `# Context` block containing:

| Variable | Description |
|----------|-------------|
| `sys.datetime`, `sys.date`, `sys.time`, `sys.ts`, `sys.tz` | Current date/time at execution |
| `project.name`, `project.cwd`, `project.slug` | Project identity |
| `engine.name`, `engine.command`, `engine.model` | Engine in use |
| `bot.userId` | From `runAs` (empty if not set) |
| `bot.messageType` | Always `"cron"` |
| `cron.runs` | How many times this job has executed so far, including the current run (1 on first run) |
| `cron.lastRun` | ISO 8601 start timestamp of the previous execution (empty string on the first run) |

Context vars are built **fresh on every execution** — `@{}` dynamic lookups (current date/time, shell output, etc.) always reflect the time of the run. `cron.*` vars are also available for `${VAR}` substitution in frontmatter.

### Examples

**Silent recurring cron (log-only):**

```markdown
---
enabled: true
schedule: "0 * * * *"
---

Check if any long-running processes are using excessive memory and summarise the top 5.
```

**Recurring cron with `runAs` and `notify`:**

```markdown
---
enabled: true
schedule: "0 8 * * 1-5"
runAs: 123456
notify:
  - 789012
---

Summarise yesterday's commits in this repository. Include: files changed, authors, and a one-sentence summary per commit. Keep it under 10 lines.
```

Result is sent to user `123456` (with their context injected) and also to user `789012`.

**One-off cron:**

```markdown
---
enabled: true
runAt: "2026-06-01T09:00:00Z"
runAs: 123456
---

Remind me to run the release checklist for v2.0 today.
```

---

## Variable substitution in `.md` frontmatter

`${VAR}` patterns in `.md` frontmatter are resolved before YAML parsing. This lets you keep sensitive values (user IDs, schedules) out of cron files and in environment files instead.

### Syntax

```yaml
runAs: ${MY_USER_ID}
notify:
  - ${TEAM_LEAD_ID}
schedule: "${MORNING_SCHEDULE}"
```

### Resolution chain (project crons)

Sources are checked in order; the first match wins:

| Priority | Source |
|----------|--------|
| 1 | `ctx` — merged `config.context` + `bootContext.shellCache` for this project |
| 2 | `.env.local` — `{projectCwd}/.env.local` |
| 3 | `.env` — `{projectCwd}/.env` |
| 4 | `.env.local` — `{configDir}/.env.local` |
| 5 | `.env` — `{configDir}/.env` |
| 6 | `process.env` — shell environment |

Env files are re-read on every hot-reload so changes to `.env.local` are picked up without a restart.

### Example

`{projectCwd}/.env.local`:
```
MY_USER_ID=123456789
MORNING_SCHEDULE=0 8 * * 1-5
```

`{projectCwd}/.hal/crons/morning-briefing.md`:
```markdown
---
enabled: true
schedule: "${MORNING_SCHEDULE}"
runAs: ${MY_USER_ID}
---

Summarise yesterday's commits in this repository. Include: files changed, authors, and a one-sentence summary per commit. Keep it under 10 lines.
```

> **Note:** Variable substitution applies to `.md` frontmatter only. The prompt body is sent as-is (no `${}`, `@{}`, or bar-style `|var|` substitution). `.mjs` files are plain JavaScript — use `process.env.VAR_NAME` directly.

---

## `.mjs` — Programmatic crons

The file is an ES module that exports scheduling metadata and a `handler` function. The handler receives a `ProjectCronContext` — a flat, project-scoped context built fresh on every execution.

```js
export const enabled = true;
export const schedule = "0 9 * * 1-5";  // weekdays at 09:00

/**
 * @param {import('@marcopeg/hal').ProjectCronContext} ctx
 */
export async function handler(ctx) {
  // ctx.project   — full resolved project config
  // ctx.bot       — Grammy Bot for this project
  // ctx.context   — resolved context vars (same map as .md injection)
  // ctx.call()    — call this project's AI engine
}
```

### `ProjectCronContext` reference

| Property | Type | Description |
|---|---|---|
| `ctx.project` | `ResolvedProjectConfig` | Full resolved config: slug, name, cwd, engine, model, session, context vars. |
| `ctx.bot` | `Bot` | Grammy Bot instance scoped to this project. Full Telegram API access. |
| `ctx.context` | `Record<string, string>` | Resolved context vars — same map injected into `.md` prompts. Includes `cron.runs` and `cron.lastRun`. Built fresh per execution. |
| `ctx.call(prompt)` | `(prompt: string) => Promise<string>` | Call this project's AI engine anonymously. Returns the response string. |

### `.mjs` export reference

| Export | Type | Required | Description |
|---|---|---|---|
| `enabled` | boolean | no | Defaults to `false`. Must be `true` to schedule. |
| `schedule` | string | one of | Schedule: cron expression, `"+5m"` (relative recurring), or `"!30s"` (relative single-shot). See [scheduling reference](../scheduling/README.md). |
| `runAt` | string | one of | ISO 8601 absolute datetime (one-off). |
| `scheduleStarts` | string \| Date | no | Delay scheduling until this point. Relative string (`"20m"`), ISO string, or `Date` object. |
| `scheduleEnds` | string \| Date | no | Stop recurring executions after this point. Relative string (`"20d"`), ISO string, or `Date` object. |
| `runAs` | number \| string | no | User ID injected as `bot.userId` in context vars. Accepts a string (`"123456789"`) — coerced to number. |
| `handler` | function | yes | `async (ctx: ProjectCronContext) => Promise<void>` |

### Example

```js
// .hal/crons/project-summary.mjs
export const enabled = true;
export const schedule = "0 17 * * 5"; // every Friday at 17:00

export async function handler(ctx) {
  const summary = await ctx.call(
    "Summarise this week's git activity: commits, authors, and key changes.",
  );

  // Send to a specific user
  await ctx.bot.api.sendMessage(123456, summary);

  // Or use context vars in your own logic
  const projectName = ctx.context["project.name"] ?? ctx.project.name ?? "project";
  await ctx.bot.api.sendMessage(123456, `Weekly summary for ${projectName}:\n\n${summary}`);
}
```

---

## Execution logs

Logs are written to the centralised log directory under a `projects/` subfolder:

```
{configDir}/.hal/logs/crons/projects/{slug}/{name}.{type}/{timestamp}.{name}.txt
```

Example:
```
~/.config/hal/.hal/logs/crons/projects/my-project/morning-briefing.md/2026-03-11T08-00-00-000.morning-briefing.txt
```

The extension in the folder name (`.md` / `.mjs`) prevents collisions when a `.md` and `.mjs` cron share the same name.

Log file contents match the system-tier format: header, `--- prompt ---`, `--- context ---`, `--- project config ---`, `--- output ---`, `--- error ---`.

---

## Hot reload

The directory `{projectCwd}/.hal/crons/` is watched for changes:

- **File added** → load and schedule new job immediately (no restart required).
- **File changed** → reload definition and replace the existing scheduled job.
- **File deleted** → remove the job from the scheduler.
- **Invalid file** → log error, skip. Process continues unaffected.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Cron defined but never fires | `enabled: true` not set, `runAt` is in the past, or `scheduleStarts` is still in the future. |
| No DM received | Check `runAs` / `notify` user IDs. Check bot has permission to DM the user. |
| `ctx.context` values are stale | Not possible — context is built fresh on every execution tick. |
| Log directory not created | Will be created automatically on first execution. |
