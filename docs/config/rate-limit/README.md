# Rate limit

Rate limiting caps how many messages a user can send to the bot in a given time window. It is set globally in `globals.rateLimit` and can be overridden per project in the `projects` map (e.g. `projects.<key>.rateLimit`). Each project (bot) has its own limit and its own per-user counters — limits are **per user per bot**.

## Options

| Key | Description | Default |
|-----|-------------|---------|
| `max` | Maximum number of messages allowed per user in one window | `10` |
| `windowMs` | Window length in milliseconds. The window starts when the user sends their first message in a new period. | `60000` (1 minute) |

**How it works:** When a user sends a message, the bot checks how many messages that user has already sent in the current window. If they are under `max`, the message is processed. If they have reached `max`, the bot replies with “Rate limit exceeded. Please wait X seconds…” and does not process the message. After `windowMs` milliseconds from the **start** of the current window (i.e. from that user’s first message in the period), the counter resets and the next message starts a new window.

So with the defaults (`max: 10`, `windowMs: 60000`): each user can send **at most 10 messages in any 60-second period** (counting from their first message in that period). This applies to all incoming updates that go through the bot (text, photos, documents, voice, etc.).

## Example

```yaml
globals:
  rateLimit:
    max: 10
    windowMs: 60000
projects:
  backend:
    cwd: ./backend
    telegram:
      botToken: "${BACKEND_BOT_TOKEN}"
  support:
    cwd: ./support
    telegram:
      botToken: "${SUPPORT_BOT_TOKEN}"
    rateLimit:
      max: 30
      windowMs: 60000
```

Here **backend** uses the global limit (10 messages per 60 seconds per user). **support** overrides it to allow 30 messages per 60 seconds per user.

## Implementation note

Counters are kept in memory per bot. When the process restarts, all counters are cleared. Expired windows are cleaned up periodically so the store does not grow indefinitely.

[← Back to Configuration](../README.md)
