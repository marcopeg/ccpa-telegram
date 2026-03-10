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

### Frontmatter field reference

| Field      | Type    | Required | Default | Description |
|------------|---------|----------|---------|-------------|
| `enabled`  | boolean | **Yes**  | `false` | Must be `true` for the job to be scheduled. Omitting it (or setting `false`) silently skips the job. |
| `schedule` | string  | One of   | —       | Cron expression for recurring jobs (e.g. `"0 9 * * *"`) |
| `runAt`    | string  | One of   | —       | ISO 8601 datetime for a one-off job (e.g. `"2026-06-01T09:00:00Z"`) |
| `targets`  | array   | Yes      | —       | One or more target projects (at least one entry required) |

**`schedule` and `runAt` are mutually exclusive.** Exactly one must be set.

> **`enabled` defaults to `false`.** A cron file without `enabled: true` is loaded and validated but never scheduled. This makes it safe to commit draft crons to version control without them firing.

### Target object reference

Each entry in `targets` is an object:

| Field        | Type    | Required | Description |
|--------------|---------|----------|-------------|
| `projectId`  | string  | Yes      | Slug of the project whose engine runs the prompt |
| `userId`     | number  | No       | Telegram user ID — currently used only for `flowResult` routing |
| `flowResult` | boolean | No       | If `true`, the agent's response is sent as a Telegram DM to `userId`. Requires `userId`. |

**Validation rule:** `flowResult: true` without `userId` is a configuration error — the process will not start.

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

The same prompt runs on multiple projects. Each target is evaluated independently.

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

A `.mjs` cron is an ES module that exports a scheduling declaration and a handler function. The handler receives a `CronContext` object and can use the Grammy Bot API to send messages, query external services, or perform any JavaScript operation.

### Export reference

| Export     | Type     | Required | Default | Description |
|------------|----------|----------|---------|-------------|
| `enabled`  | boolean  | **Yes**  | `false` | Must be `true` for the job to be scheduled. Omitting it silently skips the job. |
| `schedule` | string   | One of   | —       | Cron expression for recurring jobs |
| `runAt`    | string   | One of   | —       | ISO 8601 datetime for a one-off job |
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

**Accessing a project:**

```js
const { bot, config } = ctx.projects["my-project"];
```

**Sending a message:**

```js
await bot.api.sendMessage(userId, "Hello from a scheduled task!");
```

### Examples

#### Recurring health-check every 15 minutes

```js
// .hal/crons/health-check.mjs
export const enabled = true;
export const schedule = "*/15 * * * *";

export async function handler(ctx) {
  const { bot } = ctx.projects["my-project"];
  const userId = 123456789;

  try {
    // Replace with your actual check logic
    const ok = true;
    if (ok) {
      await bot.api.sendMessage(userId, "✓ Health check passed");
    }
  } catch (err) {
    await bot.api.sendMessage(
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
  const { bot } = ctx.projects["backend"];
  const adminId = 123456789;

  await bot.api.sendMessage(adminId, "Starting schema migration…");

  try {
    // Your migration logic here
    await bot.api.sendMessage(adminId, "✓ Schema migration complete");
  } catch (err) {
    await bot.api.sendMessage(
      adminId,
      `✗ Migration failed: ${err.message}`,
    );
  }
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

### Cron expressions (`schedule`)

HAL uses [croner](https://github.com/hexagon/croner) for cron expression parsing. Full croner documentation is available at [github.com/hexagon/croner](https://github.com/hexagon/croner).

Croner supports both standard 5-field and extended 6-field expressions. The optional leading field adds **seconds** precision, enabling sub-minute scheduling:

```
┌──────────────── second (0-59)      [optional — omit for standard 5-field syntax]
│ ┌────────────── minute (0-59)
│ │ ┌──────────── hour (0-23)
│ │ │ ┌────────── day of month (1-31)
│ │ │ │ ┌──────── month (1-12 or JAN-DEC)
│ │ │ │ │ ┌────── day of week (0-7 or SUN-SAT, 0 and 7 are Sunday)
│ │ │ │ │ │
* * * * * *   ← 6-field (with seconds)
  * * * * *   ← 5-field (standard, minute precision)
```

Common examples:

| Expression          | Meaning                                      |
|---------------------|----------------------------------------------|
| `"*/10 * * * * *"`  | Every 10 seconds (6-field)                   |
| `"*/30 * * * * *"`  | Every 30 seconds (6-field)                   |
| `"*/15 * * * *"`    | Every 15 minutes (5-field)                   |
| `"0 9 * * *"`       | Every day at 09:00                           |
| `"0 9 * * 1"`       | Every Monday at 09:00                        |
| `"0 8 * * 1-5"`     | Weekdays at 08:00                            |
| `"0 0 1 * *"`       | First day of every month at midnight         |
| `"0 2 * * 0"`       | Every Sunday at 02:00                        |

### Absolute one-off (`runAt`)

An ISO 8601 datetime string. The job fires once at that moment (UTC unless a timezone offset is included).

```yaml
runAt: "2026-06-01T09:00:00Z"       # UTC
runAt: "2026-06-01T09:00:00+02:00"  # CEST
```

**Past dates:** if `runAt` is already in the past when the file is loaded, the job is silently skipped (a debug-level log entry is written). No error is raised.

---

## Execution logs

### Log identifier

Every log entry emitted by the scheduler includes a `jobId` field in the format `{scope}/{filename}`:

- System crons: `system/health-check`
- Project crons _(032b)_: `my-project/health-check`
- User crons _(032c)_: `user/health-check`

This makes it easy to filter cron activity in the log stream by scope or by job.

### Log files

Every job execution writes a log file to:

```
{configDir}/.hal/logs/crons/{job-name}/{timestamp}.{job-name}.txt
```

Example path:
```
/path/to/config/.hal/logs/crons/daily-git-summary/2026-03-10T09-00-00-000.daily-git-summary.txt
```

Example log file content:

```
job:     daily-git-summary
source:  /path/to/config/.hal/crons/daily-git-summary.md
started: 2026-03-10T09:00:00.000Z
ended:   2026-03-10T09:00:12.437Z
status:  ok

--- output ---
## Git summary — 2026-03-10

**my-project** — 3 commits yesterday:
- `abc1234` alice: fix null check in auth middleware
- `def5678` bob: update readme with new env vars
- `ghi9012` alice: bump version to 1.2.3
```

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

## Validation rules

| Rule | Behaviour |
|------|-----------|
| `flowResult: true` without `userId` | Hard error at boot (process exits). Logged error on hot reload (job skipped, process continues). |
| `targets` is empty or missing | Hard error at boot. Logged error on hot reload. |
| Both `schedule` and `runAt` set | Hard error at both boot and hot reload. |
| Neither `schedule` nor `runAt` set | Hard error at both boot and hot reload. |
| `runAt` is in the past | Silent skip (debug log). Not an error. |
| `.mjs` missing `handler` export | Hard error at boot. Logged error on hot reload. |
| Invalid cron expression | Error from croner at scheduling time — logged, job skipped. |
| `projectId` not found at runtime | Logged error per target; other targets in the same job continue. |

---

## Troubleshooting

**Job never fires**
- Check the cron expression with an online validator (e.g. [crontab.guru](https://crontab.guru)).
- Check `enabled` — it may be `false`.
- For `runAt`: check it is in the future (UTC). Past dates are silently skipped.

**`flowResult` DM not received**
- Verify `userId` is the correct Telegram numeric user ID (not a username).
- Check the execution log to see if the job ran and produced output.
- Make sure the user has previously sent a message to the bot (Telegram requires this before a bot can DM a user).

**`projectId not found` error in logs**
- The `projectId` in the cron's `targets` must match a project slug in `hal.config.*`.
- Project slugs are the keys in the `projects` map of your config file.

**Hot reload not picking up file changes**
- Verify the file is in `{configDir}/.hal/crons/` (not `{projectCwd}/.hal/crons/`).
- Check for YAML parse errors — they are logged and the file is skipped.

**Process exits at startup with a cron error**
- A cron file has a hard validation error (e.g. `flowResult: true` without `userId`).
- Check the error message in the startup log for the file path and fix it.
