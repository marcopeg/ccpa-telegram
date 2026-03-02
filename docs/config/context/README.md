# Context injection

Every message sent to the engine is automatically enriched with a structured context header. This provides metadata (message info, timestamps, custom values) so the AI can reason about the current request without extra tool calls.

You configure context in the main [configuration](../README.md) via the `context` key at root or per project.

## Implicit context (always-on)

These keys are injected for every message, even without any `context` configuration:

| Key | Description |
|-----|-------------|
| `bot.messageId` | Telegram message ID |
| `bot.timestamp` | Message Unix timestamp (seconds) |
| `bot.datetime` | Message datetime, ISO 8601 |
| `bot.userId` | Sender's Telegram user ID |
| `bot.username` | Sender's @username (if set) |
| `bot.firstName` | Sender's first name |
| `bot.chatId` | Chat ID |
| `bot.messageType` | `text` / `photo` / `document` / `voice` |
| `project.name` | Project name (falls back to internal slug if not set) |
| `project.cwd` | Resolved absolute project working directory |
| `project.slug` | Project slug (full path with `/` → `-`) |
| `sys.datetime` | Current local datetime with timezone |
| `sys.date` | Current date, `YYYY-MM-DD` |
| `sys.time` | Current time, `HH:MM:SS` |
| `sys.ts` | Current Unix timestamp (seconds) |
| `sys.tz` | Timezone name (e.g. `Europe/Berlin`) |
| `engine.name` | Engine identifier (e.g. `claude`, `copilot`) |
| `engine.command` | CLI command used to invoke the engine |
| `engine.model` | AI model from config (only present when explicitly set) |
| `engine.defaultModel` | HAL default model applied (only present when `engine.model` is omitted; see [Model defaults](../../engines/README.md#model-defaults)) |

## Custom context via config

Add a `context` object at the root level of `hal.config.json` (applies to all projects) or inside individual projects (overrides root per key):

```json
{
  "globals": { ... },
  "context": {
    "messageId": "${bot.messageId}",
    "currentTime": "${sys.datetime}",
    "buildVersion": "#{git rev-parse --short HEAD}"
  },
  "projects": [
    {
      "name": "backend",
      "cwd": "./backend",
      "telegram": { "botToken": "${BACKEND_BOT_TOKEN}" },
      "context": {
        "project": "backend",
        "liveTimestamp": "@{date +\"%Y-%m-%d %H:%M:%S\"}"
      }
    }
  ]
}
```

Project context is merged on top of root — `backend` inherits `messageId`, `currentTime`, and `buildVersion` from root context, and adds `project` and `liveTimestamp`.

## Variable substitution patterns

Three patterns are supported in context values:

| Pattern | Evaluated | Description |
|---------|-----------|-------------|
| `${expr}` | Per message | Looks up `expr` in implicit context (`bot.*`, `sys.*`), then env vars |
| `#{cmd}` | Once at boot | Runs shell command, caches result for all messages |
| `@{cmd}` | Per message | Runs shell command fresh for each message |

## Context hooks

For advanced enrichment, you can provide a `context.mjs` hook file that transforms the context object with arbitrary JavaScript. Two hook locations are supported:

| Location | Scope |
|----------|-------|
| `{configDir}/.hal/hooks/context.mjs` | Global — runs for all projects |
| `{project.cwd}/.hal/hooks/context.mjs` | Project — runs for that project only |

When both exist, they chain: global runs first, its output feeds into the project hook. Both are **hot-reloaded** on every message (no restart needed) — so the AI engine itself can create or modify hooks at runtime.

```js
// .hal/hooks/context.mjs
export default async (context) => ({
  ...context,
  project: "my-tracker",
  user: await fetchUserProfile(context["bot.userId"])
})
```

- **Input**: fully-resolved `Record<string, string>` context
- **Output**: a `Record<string, string>` — the final context passed to the engine
- If a hook throws, the bot logs the error and falls back to the pre-hook context

## Prompt format

The resolved context is prepended to the user message before passing to the engine:

```
# Context
- bot.messageId: 12345
- sys.datetime: 2026-02-26 14:30:00 UTC+1
- project: backend

# User Message
What files changed today?
```

[← Back to Configuration](../README.md)
