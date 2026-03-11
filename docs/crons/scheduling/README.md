# Cron scheduling reference

The `schedule` and `runAt` fields (`.md` frontmatter) and the `schedule` / `runAt` exports (`.mjs`) accept four formats. All formats work identically for system crons and project crons.

---

## Formats at a glance

| Format | Example | Behaviour |
|--------|---------|-----------|
| Cron expression | `"0 9 * * *"` | Recurring, calendar-aligned |
| Absolute one-off | `runAt: "2026-06-01T09:00:00Z"` | Fires once at the given UTC time |
| Relative recurring | `"5m"`, `"+5m"` | Fires after the delay, then repeats — next countdown starts after execution completes |
| Relative single-shot | `"!30s"`, `"!5m"` | Fires once after the delay |

**`schedule` and `runAt` are mutually exclusive.** Exactly one must be set.

---

## Cron expressions

HAL uses [croner](https://github.com/hexagon/croner) for cron expression parsing.

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

Use `schedule` for cron expressions:

```yaml
schedule: "0 9 * * *"
```

---

## Absolute one-off (`runAt`)

An ISO 8601 datetime string. The job fires once at that moment and is never rescheduled.

```yaml
runAt: "2026-06-01T09:00:00Z"       # UTC
runAt: "2026-06-01T09:00:00+02:00"  # CEST
```

**Past dates:** if `runAt` is already in the past when the file is loaded, the job is silently skipped (a debug-level log entry is written). No error is raised.

**Hot reload:** editing `runAt` to a future date and saving the file will re-arm the job automatically.

---

## Relative recurring (`Xs` / `+Xs`)

Fire after the expressed delay relative to when the file is loaded, then repeat at the same interval — indefinitely. The `+` prefix is optional.

### Syntax

```
[+]<amount><unit>
```

### Units

| Suffix | Unit    |
|--------|---------|
| `s`    | seconds |
| `m`    | minutes |
| `h`    | hours   |
| `d`    | days    |
| `w`    | weeks   |

Amount can be a decimal: `+1.5h` = 90 minutes.

### Examples

```yaml
schedule: "30s"    # first run in 30 s, then every 30 s  (+ prefix optional)
schedule: "+30s"   # same as above
schedule: "5m"     # first run in 5 min, then every 5 min
schedule: "+1h"    # first run in 1 hour, then every hour
schedule: "12h"    # first run in 12 hours, then every 12 hours
schedule: "1d"     # first run in 1 day, then every day
schedule: "7d"     # first run in 7 days, then every 7 days (same as 1w)
schedule: "+22d"   # first run in 22 days, then every 22 days
```

### Sequential execution guarantee

The next countdown only starts **after the current execution fully completes**. If `+5m` is set and execution takes 2 minutes, the next run begins 5 minutes after the previous one *finished* — not 3 minutes later. The effective cadence is `execution time + interval`.

### Difference from cron expressions

Cron expressions are calendar-aligned: `*/30 * * * * *` fires at :00 and :30 of every minute, regardless of when the process started. `+30s` always fires 30 seconds after the job was loaded, then 30 seconds after each previous execution completes. For long intervals (days, weeks), this means the job drifts with restarts rather than aligning to a wall-clock schedule. Use `+Xd` when you care about the interval, and a cron expression when you care about the time of day.

### `.mjs` equivalent

```js
export const enabled = true;
export const schedule = "5m";    // recurring every 5 minutes from load (+ optional)

export async function handler(ctx) {
  // ...
}
```

---

## Relative single-shot (`!Xs`)

Fire once after the expressed delay. The job is never rescheduled.

### Syntax

```
!<amount><unit>
```

Same units and decimal support as `+Xs`.

### Examples

```yaml
schedule: "!30s"    # fire once in 30 seconds
schedule: "!5m"     # fire once in 5 minutes
schedule: "!1h"     # fire once in 1 hour
```

### Use cases

- **Delayed bootstrap tasks** — run something once shortly after startup.
- **Deferred one-offs** — instead of computing an absolute datetime for `runAt`, express the delay relative to now.
- **Testing** — `!5s` lets you verify a cron fires correctly without waiting for a scheduled window.

### Difference from `runAt`

`runAt` is an absolute timestamp that survives process restarts (the same future time is always used). `!Xs` is relative to the moment the file is loaded — a restart resets the delay clock. Use `runAt` when you need a guaranteed wall-clock trigger; use `!Xs` when a delay-from-now is more natural.

### `.mjs` equivalent

```js
export const enabled = true;
export const schedule = "!10s";  // fire once 10 seconds after load

export async function handler(ctx) {
  // ...
}
```

---

## `scheduleStarts` — delay before start

`scheduleStarts` is an optional property that delays when a job becomes active. Until the start time is reached, the job is **not scheduled**. Once the start time passes, the schedule is armed as if the file were just loaded.

Accepted values:

| Value | Meaning |
|-------|---------|
| Relative duration (`"20m"`, `"2h"`, `"3d"`) | Start time = now + duration (evaluated when the file is loaded) |
| ISO 8601 datetime (`"2026-12-31T23:59:59Z"`) | Absolute wall-clock start time |

### `.md` frontmatter

```yaml
---
enabled: true
schedule: "0 9 * * *"
scheduleStarts: "20m"    # delay scheduling by 20 minutes
---
```

```yaml
---
enabled: true
runAt: "2026-06-01T09:00:00Z"
scheduleStarts: "2026-06-01T08:00:00Z"
---
```

### `.mjs` export

```js
export const enabled = true;
export const schedule = "5m";
export const scheduleStarts = "30m"; // start in 30 minutes
```

### Behaviour

- `scheduleStarts` in the past → ignored; the job is scheduled immediately.
- `scheduleStarts` in the future → job is armed only after the start time is reached.
- For `runAt` jobs, if the start time is **after** `runAt`, the job will be skipped because the one-off time is already in the past.

---

## `scheduleEnds` — expiry for recurring jobs

`scheduleEnds` is an optional property that stops a recurring schedule after a given point in time. Once the deadline passes, no further executions are started. Already-running executions complete normally.

Accepted values:

| Value | Meaning |
|-------|---------|
| Relative duration (`"20d"`, `"2w"`, `"1h"`) | Deadline = now + duration, evaluated when the file is **loaded** |
| ISO 8601 datetime (`"2026-12-31T23:59:59Z"`) | Absolute wall-clock deadline |

> **Relative `scheduleEnds` is anchored to load time, not to the first execution.** `schedule: "5m"` with `scheduleEnds: "20d"` means "run every 5 minutes, stop 20 days after this file was loaded (or the process restarted)."

### `.md` frontmatter

```yaml
---
enabled: true
schedule: "5m"
scheduleEnds: "20d"      # stop after 20 days from load
---
```

```yaml
---
enabled: true
schedule: "0 9 * * *"
scheduleEnds: "2026-12-31T23:59:59Z"   # stop at absolute date
---
```

### `.mjs` export

`scheduleEnds` can be exported as a string (relative or ISO) or as a `Date` object:

```js
export const enabled = true;
export const schedule = "5m";
export const scheduleEnds = "20d";               // relative: 20 days from load

// or
export const scheduleEnds = "2026-12-31T23:59:59Z";  // absolute ISO string

// or
export const scheduleEnds = new Date("2026-12-31T23:59:59Z");  // Date object
```

### Behaviour

- `scheduleEnds` in the past at **boot or hot reload** → job is silently skipped (debug log). Not an error.
- `scheduleEnds` reached **mid-run** → current execution completes normally; next `scheduleNext()` call sees the deadline and stops the chain.
- **`runAt` jobs** — `scheduleEnds` is redundant (one-off by definition) but accepted without error.
- **Hot reload**: if `scheduleEnds` is a relative value, it is re-evaluated from the moment the file is saved, effectively resetting the deadline clock.

---

## Behaviour on hot reload

All formats are re-evaluated when a cron file is saved:

| Format | Hot-reload behaviour |
|--------|----------------------|
| Cron expression | Schedule is replaced; next tick calculated from the updated expression |
| `runAt` | If the new date is in the future, the job is re-armed |
| `Xs` / `+Xs` (interval) | Timer is reset; first fire will occur `X` after the file was saved |
| `!Xs` (once) | Timer is reset; job fires once `X` after the file was saved |
| `scheduleStarts` (relative) | Start time is re-evaluated from save time |
| `scheduleStarts` (absolute) | Start time is unchanged unless the value itself is edited |
| `scheduleEnds` (relative) | Deadline is re-evaluated from save time |
| `scheduleEnds` (absolute) | Deadline is unchanged unless the value itself is edited |

---

## Validation rules

| Rule | Behaviour |
|------|-----------|
| Both `schedule` and `runAt` set | Error at both boot and hot reload |
| Neither `schedule` nor `runAt` set | Error at both boot and hot reload |
| `enabled` absent or `false` | Loaded and validated, but not scheduled (silent debug log) |
| `runAt` in the past | Silent skip (debug log). Not an error. |
| `scheduleStarts` in the past | Ignored; the job starts immediately. |
| `scheduleEnds` in the past | Silent skip (debug log). Not an error. |
| Invalid cron expression | Error from croner at scheduling time — logged, job skipped |
| `+0s` / `!0s` (zero delay) | Technically valid — fires immediately on the next event-loop tick |
