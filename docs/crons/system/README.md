# System crons

System crons are scheduled tasks defined at the operator level. They are available to all projects and run under an anonymous session (no user context unless explicitly configured).

## File location

```
{configDir}/.hal/crons/
```

Where `{configDir}` is the directory containing your `hal.config.*` file (defaults to the current working directory). Each cron job is a single file — either `.md` (prompt-based) or `.mjs` (programmatic).

Files in this directory are **hot-reloaded**: add, edit, or delete a file and the scheduler updates immediately without restarting the process.

---

## Prompt-based crons (`.md`)

A `.md` cron sends a prompt to a project's AI engine on schedule. The YAML frontmatter configures scheduling and targets; the Markdown body is the prompt.

The **filename** (without extension) is the job name. There is no `name` field.

### Frontmatter field reference

| Field      | Type    | Required | Default | Description |
|------------|---------|----------|---------|-------------|
| `enabled`  | boolean | **Yes**  | `false` | Must be `true` for the job to be scheduled. Omitting it (or setting `false`) silently skips the job. |
| `schedule` | string  | One of   | —       | Schedule for the job. Accepts: cron expressions (`"0 9 * * *"`), relative recurring (`"+5m"`), relative single-shot (`"!30s"`). See [scheduling reference](../scheduling/README.md). |
| `runAt`    | string  | One of   | —       | ISO 8601 datetime for a one-off job (e.g. `"2026-06-01T09:00:00Z"`) |
| `scheduleStarts` | string | No | — | Delay scheduling until this point. Relative (`"20m"`) or ISO 8601 absolute. See [scheduleStarts](../scheduling/README.md#schedulestarts--delay-before-start). |
| `scheduleEnds` | string | No  | —       | Stop recurring executions after this point. Relative (`"20d"`) or ISO 8601 absolute. See [scheduling reference](../scheduling/README.md#scheduleends--expiry-for-recurring-jobs). |
| `targets`  | array   | Yes      | —       | One or more target projects (at least one entry required) |

**`schedule` and `runAt` are mutually exclusive.** Exactly one must be set.

> **`enabled` defaults to `false`.** A cron file without `enabled: true` is loaded and validated but never scheduled. This makes it safe to commit draft crons to version control without them firing.

### Target object reference

Each entry in `targets` is an object:

| Field        | Type    | Required | Description |
|--------------|---------|----------|-------------|
| `projectId`  | string  | Yes      | Slug of the project whose engine runs the prompt |
| `userId`     | number  | No       | Telegram user ID — used as `bot.userId` in the injected context and for `flowResult` routing |
| `flowResult` | boolean | No       | If `true`, the agent's response is sent as a Telegram DM to `userId`. Requires `userId`. |

**Validation rule:** `flowResult: true` without `userId` is a configuration error — the process will not start.

### Context injection

Before calling the engine, the prompt is automatically wrapped with a `# Context` block (identical to user-driven messages) containing:

| Variable | Description |
|----------|-------------|
| `sys.datetime`, `sys.date`, `sys.time`, `sys.ts`, `sys.tz` | Current date/time |
| `project.name`, `project.cwd`, `project.slug` | Target project identity |
| `engine.name`, `engine.command`, `engine.model` | Engine in use |
| `bot.userId` | From `target.userId` (empty if not set) |
| `bot.messageType` | Always `"cron"` |
| `cron.runs` | How many times this job has executed so far, including the current run (1 on first run) |
| `cron.lastRun` | ISO 8601 start timestamp of the previous execution (empty string on the first run) |

Any `context:` vars defined in the project config are also merged in, and both the global and project-level `context.mjs` hooks are run. This gives the engine the same project awareness it has when responding to user messages.

### Examples

#### Recurring daily summary with DM

Runs every day at 09:00 UTC and sends the agent's response to a Telegram user.

```markdown
---
enabled: true
schedule: "0 9 * * *"
targets:
  - projectId: my-project
    userId: 123456789
    flowResult: true
---

Summarise the git log from the last 24 hours. List files changed, authors, and a one-sentence summary per commit. Keep it under 10 lines.
```

#### One-off reminder

Runs once at the specified time and sends a DM. After firing, editing `runAt` to a future date will re-arm it.

```markdown
---
enabled: true
runAt: "2026-06-01T08:00:00Z"
targets:
  - projectId: my-project
    userId: 123456789
    flowResult: true
---

Remind me to run the production deploy checklist. List the key steps: version bump, changelog, staging deploy, smoke test, production deploy.
```

#### Multi-target cron

The same prompt runs on multiple projects. Each target is evaluated independently and produces its own log file.

```markdown
---
enabled: true
schedule: "0 10 * * 1"
targets:
  - projectId: backend
    userId: 123456789
    flowResult: true
  - projectId: frontend
    userId: 123456789
    flowResult: true
---

Run a quick health check: list any failing tests, unresolved TODO comments, and outdated dependencies. Be brief.
```

#### Silent cron (log only)

No `flowResult` — the agent runs and the output is written to the execution log but not sent anywhere.

```markdown
---
enabled: true
schedule: "0 2 * * *"
targets:
  - projectId: my-project
---

Clean up temporary files older than 7 days in the `tmp/` directory. Report what was removed.
```

---

## Programmatic crons (`.mjs`)

A `.mjs` cron is an ES module that exports a scheduling declaration and a handler function. The handler receives a `CronContext` object and can call the project's AI engine, use the Grammy Bot API to send messages, query external services, or perform any JavaScript operation.

The **filename** (without extension) is the job name. There is no `name` export.

### Export reference

| Export     | Type     | Required | Default | Description |
|------------|----------|----------|---------|-------------|
| `enabled`  | boolean  | **Yes**  | `false` | Must be `true` for the job to be scheduled. Omitting it silently skips the job. |
| `schedule` | string   | One of   | —       | Schedule: cron expression, `"+5m"` (relative recurring), or `"!30s"` (relative single-shot). See [scheduling reference](../scheduling/README.md). |
| `runAt`    | string   | One of   | —       | ISO 8601 datetime for a one-off job |
| `scheduleStarts` | string \| Date | No | — | Delay scheduling until this point. Relative string (`"20m"`), ISO string, or `Date` object. |
| `scheduleEnds` | string \| Date | No | — | Stop recurring executions after this point. Relative string (`"20d"`), ISO string, or `Date` object. |
| `handler`  | function | Yes      | —       | Async function called on each tick: `async (ctx) => void` |

**`schedule` and `runAt` are mutually exclusive.** Exactly one must be exported.

> **`enabled` defaults to `false`.** A `.mjs` file without `export const enabled = true` is loaded and validated but never scheduled.

### `CronContext` reference

The `ctx` object passed to every handler:

| Property | Type | Description |
|----------|------|-------------|
| `ctx.config` | `Record<string, unknown>` | Full computed HAL configuration currently in use |
| `ctx.projects` | `Record<string, CronProjectContext>` | Map of project slug → project context |
| `ctx.projects[key].config` | `ResolvedProjectConfig` | Project config slice |
| `ctx.projects[key].bot` | `Bot` | Grammy Bot instance for this project (full Telegram API access) |
| `ctx.projects[key].call(prompt)` | `(prompt: string) => Promise<string>` | Call the project's AI engine with a prompt and return the response |
| `ctx.cron.runs` | `number` | How many times this job has executed so far, including the current run (1 on first run) |
| `ctx.cron.lastRun` | `Date \| undefined` | Start timestamp of the previous execution. `undefined` on the first run. |

**Accessing a project:**

```js
const project = ctx.projects["my-project"];
```

**Sending a message:**

```js
await project.bot.api.sendMessage(userId, "Hello from a scheduled task!");
```

**Calling the AI engine:**

```js
const response = await project.call("Summarise the last 10 git commits in one paragraph.");
await project.bot.api.sendMessage(userId, response);
```

**Iterating available projects (e.g. pick the first active one):**

```js
const [slug, project] = Object.entries(ctx.projects)[0];
const answer = await project.call("Quick status check — any issues?");
console.log(`[${slug}] ${answer}`);
```

### Examples

#### Recurring health-check every 15 minutes

```js
// .hal/crons/health-check.mjs
export const enabled = true;
export const schedule = "*/15 * * * *";

export async function handler(ctx) {
  const project = ctx.projects["my-project"];
  const userId = 123456789;

  try {
    // Replace with your actual check logic
    const ok = true;
    if (ok) {
      await project.bot.api.sendMessage(userId, "✓ Health check passed");
    }
  } catch (err) {
    await project.bot.api.sendMessage(
      userId,
      `✗ Health check failed: ${err.message}`,
    );
  }
}
```

#### One-off migration task

Runs once at the specified time. After it fires, updating `runAt` and saving the file will re-arm it via hot reload.

```js
// .hal/crons/migrate-schema.mjs
export const enabled = true;
export const runAt = "2026-06-15T02:00:00Z";

export async function handler(ctx) {
  const project = ctx.projects["backend"];
  const adminId = 123456789;

  await project.bot.api.sendMessage(adminId, "Starting schema migration…");

  try {
    // Your migration logic here
    await project.bot.api.sendMessage(adminId, "✓ Schema migration complete");
  } catch (err) {
    await project.bot.api.sendMessage(
      adminId,
      `✗ Migration failed: ${err.message}`,
    );
  }
}
```

#### One-shot AI call — log to stdout only

Uses the first available project's engine to generate a response and logs it without sending a Telegram message.

```js
// .hal/crons/daily-insight.mjs
export const enabled = true;
export const runAt = "2026-06-01T09:00:00Z";

export async function handler(ctx) {
  const [slug, project] = Object.entries(ctx.projects)[0];
  if (!project) {
    console.log("[daily-insight] No projects available — skipping.");
    return;
  }

  const insight = await project.call(
    "Give one actionable insight about this project based on recent activity.",
  );
  console.log(`[daily-insight] (${slug})\n${insight}`);
}
```

#### Multi-project status aggregator

Iterates over multiple projects and sends a combined report.

```js
// .hal/crons/daily-status.mjs
export const enabled = true;
export const schedule = "0 8 * * 1-5"; // weekdays at 08:00

const PROJECTS = ["backend", "frontend", "infra"];
const NOTIFY_USER = 123456789;

export async function handler(ctx) {
  const lines = ["*Daily status — " + new Date().toDateString() + "*"];

  for (const slug of PROJECTS) {
    const project = ctx.projects[slug];
    if (!project) {
      lines.push(`• ${slug}: not found in config`);
      continue;
    }
    lines.push(`• ${slug}: scheduled ✓`);
  }

  // Send to any project's bot — they all have the same API
  const bot = ctx.projects[PROJECTS[0]]?.bot;
  if (bot) {
    await bot.api.sendMessage(NOTIFY_USER, lines.join("\n"), {
      parse_mode: "Markdown",
    });
  }
}
```

---

## Scheduling reference

→ See **[Cron scheduling reference](../scheduling/README.md)** for the full guide covering cron expressions, `runAt`, relative recurring (`+Xs`), and relative single-shot (`!Xs`).

---

## Execution logs

### Log identifier

Every log entry emitted by the scheduler includes a `jobId` field in the format `{scope}/{filename}`:

- System crons: `system/health-check`
- Project crons: `my-project/health-check`
- User crons: `user/health-check`

This makes it easy to filter cron activity in the log stream by scope or by job.

### Log files

Every job execution writes a log file to:

```
# System crons
{configDir}/.hal/logs/crons/system/{job-name}.{md|mjs}/{timestamp}.{job-name}.txt

# Project crons
{configDir}/.hal/logs/crons/projects/{project-slug}/{job-name}.{md|mjs}/{timestamp}.{job-name}.txt
```

The folder name includes the file extension (`.md` / `.mjs`) so same-named prompt and programmatic crons never collide. For `.md` crons that target multiple projects, one file is written per target and the project ID is appended to the filename.

Example paths:
```
.hal/logs/crons/system/daily-git-summary.md/2026-03-10T09-00-00-000.daily-git-summary.txt
.hal/logs/crons/system/daily-git-summary.md/2026-03-10T09-00-00-000.daily-git-summary.backend.txt
.hal/logs/crons/system/daily-git-summary.md/2026-03-10T09-00-00-000.daily-git-summary.frontend.txt
.hal/logs/crons/system/health-check.mjs/2026-03-10T09-00-00-000.health-check.txt
```

### Log file content

Each log file contains the following sections:

```
job:     daily-git-summary
source:  /path/to/config/.hal/crons/daily-git-summary.md
project: my-project
started: 2026-03-10T09:00:00.000Z
ended:   2026-03-10T09:00:12.437Z
status:  ok

--- prompt ---
Summarise the git log from the last 24 hours. List files changed, authors, and a one-sentence
summary per commit. Keep it under 10 lines.

--- context ---
sys.datetime: 2026-03-10 09:00:00 UTC+0
sys.date: 2026-03-10
sys.time: 09:00:00
sys.ts: 1741600800
sys.tz: UTC
project.name: my-project
project.cwd: /path/to/my-project
project.slug: -path-to-my-project
engine.name: claude
engine.command: claude
bot.userId: 123456789
bot.messageType: cron

--- project config ---
slug:    my-project
name:    my-project
cwd:     /path/to/my-project
engine:  claude
model:   (default)
session: false

--- output ---
## Git summary — 2026-03-10

3 commits in the last 24 hours:
- `abc1234` alice: fix null check in auth middleware
- `def5678` bob: update readme with new env vars
- `ghi9012` alice: bump version to 1.2.3
```

Sections present per cron type:

| Section | `.md` | `.mjs` |
|---------|-------|--------|
| Header (job, source, project, started, ended, status) | ✓ | ✓ |
| `--- prompt ---` | ✓ | — |
| `--- context ---` | ✓ | — |
| `--- project config ---` | ✓ | — |
| `--- output ---` | ✓ | ✓ |
| `--- error ---` | on error | on error |

`.mjs` logs record `(programmatic handler completed)` as output when the handler returns without throwing.

---

## Hot reload

The system cron directory is watched for file changes. No restart is needed.

| Event       | What happens |
|-------------|--------------|
| File added  | New job is loaded, validated, and scheduled |
| File changed| Existing job is stopped and replaced with the updated definition |
| File deleted| Job is removed from the scheduler |

**On validation error (hot reload):** the error is logged and the job is skipped. The process keeps running. Fix the file and save it again to retry.

**On `runAt` update (past → future):** editing a one-off job's `runAt` to a future date and saving will re-arm the job automatically.

---

## Variable substitution in `.md` frontmatter

`${VAR}` patterns in `.md` frontmatter are resolved before YAML parsing. This lets you parameterise schedules, user IDs, and project slugs without hardcoding them in cron files.

### Syntax

```yaml
targets:
  - projectId: ${DEFAULT_PROJECT}
    userId: ${ADMIN_USER_ID}
    flowResult: true
schedule: "${BRIEFING_SCHEDULE}"
```

### Resolution chain (system crons)

Sources are checked in order; the first match wins:

| Priority | Source |
|----------|--------|
| 1 | `ctx` — values from `multiConfig.context` in `hal.config.*` |
| 2 | `.env.local` — `{configDir}/.env.local` |
| 3 | `.env` — `{configDir}/.env` |
| 4 | `process.env` — shell environment |

Env files are re-read on every hot-reload so changes to `.env.local` are picked up without a restart.

### Unresolved references

If a `${VAR}` key is not found in any source, the placeholder is left as-is (e.g. `${MISSING_KEY}`). This will almost certainly cause a YAML parse or Zod validation error — check the startup log for the file path and fix the missing variable.

### Example

`{configDir}/.env.local`:
```
ADMIN_USER_ID=123456789
BRIEFING_SCHEDULE=0 9 * * *
DEFAULT_PROJECT=my-project
```

`{configDir}/.hal/crons/daily-briefing.md`:
```markdown
---
enabled: true
schedule: "${BRIEFING_SCHEDULE}"
targets:
  - projectId: ${DEFAULT_PROJECT}
    userId: ${ADMIN_USER_ID}
    flowResult: true
---

Summarise the git log from the last 24 hours. List files changed, authors, and a one-sentence summary per commit. Keep it under 10 lines.
```

> **Note:** Variable substitution applies to `.md` frontmatter only. The prompt body is sent as-is (no `${}`, `@{}`, or bar-style `|var|` substitution). `.mjs` files are plain JavaScript — use `process.env.VAR_NAME` directly.

---

## Validation rules

| Rule | Behaviour |
|------|-----------|
| `enabled` absent or `false` | Job is loaded and validated but not scheduled. Silent (debug log). |
| `flowResult: true` without `userId` | Hard error at boot (process exits). Logged error on hot reload (job skipped, process continues). |
| `targets` is empty or missing | Hard error at boot. Logged error on hot reload. |
| Both `schedule` and `runAt` set | Hard error at both boot and hot reload. |
| Neither `schedule` nor `runAt` set | Hard error at both boot and hot reload. |
| `runAt` is in the past | Silent skip (debug log). Not an error. |
| `scheduleStarts` is in the past | Ignored; job is scheduled immediately. |
| `scheduleEnds` is in the past | Silent skip (debug log). Not an error. |
| `.mjs` missing `handler` export | Hard error at boot. Logged error on hot reload. |
| Invalid cron expression | Error from croner at scheduling time — logged, job skipped. |
| `projectId` not found at runtime | Logged error per target; a fallback log entry is written with `sys.*` context; other targets in the same job continue. |

---

## Troubleshooting

**Job never fires**
- Check the cron expression with an online validator (e.g. [crontab.guru](https://crontab.guru)).
- Check `enabled` — it may be `false` or absent (default is `false`).
- For `runAt`: check it is in the future (UTC). Past dates are silently skipped.
- Check `scheduleStarts` — if set, the job will not start until that time.
- Check `scheduleEnds` — if set, verify it is in the future. Past deadlines silently skip the job.
- For relative schedules (`5m`, `!30s`): there is no calendar alignment — the first fire occurs `X` after the file is loaded, not at a fixed clock time.

**`flowResult` DM not received**
- Verify `userId` is the correct Telegram numeric user ID (not a username).
- Check the execution log to see if the job ran and produced output.
- Make sure the user has previously sent a message to the bot (Telegram requires this before a bot can DM a user).

**`projectId not found` error in logs**
- The `projectId` in the cron's `targets` must match a project slug in `hal.config.*`.
- Project slugs are the keys in the `projects` map of your config file.
- Projects marked `active: false` are not loaded and cannot be used as cron targets.

**Hot reload not picking up file changes**
- Verify the file is in `{configDir}/.hal/crons/` (not `{projectCwd}/.hal/crons/`).
- Check for frontmatter parse errors — they are logged and the file is skipped.

**Process exits at startup with a cron error**
- A cron file has a hard validation error (e.g. `flowResult: true` without `userId`).
- Check the error message in the startup log for the file path and fix it.
