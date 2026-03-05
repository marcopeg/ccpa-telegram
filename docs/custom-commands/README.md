# Custom commands

You can add your own slash commands as `.mjs` files. When a user sends `/mycommand`, the bot looks for a matching file before passing the message to the AI engine.

## File locations

| Location | Scope |
|----------|-------|
| `{project.cwd}/.hal/commands/{name}.mjs` | Project-specific |
| `{configDir}/.hal/commands/{name}.mjs` | Global — available to all projects |

Project-specific commands take precedence over global ones on name collision.

## Command file format

```js
// .hal/commands/deploy.mjs
export const description = 'Deploy the project'; // shown in Telegram's / menu

export default async function({ args, ctx, projectCtx }) {
  const env = args[0] ?? 'staging';
  return `Deploying to ${env}...`;
}
```

The only required export is `description` (shown in Telegram's `/` suggestion menu) and a `default` function. The return value is sent to the user as a message. Return `null` or `undefined` to suppress the reply (e.g. if your command sends its own response via `gram`).

## Handler arguments

### `args: string[]`

Tokens following the command name, split on whitespace.

```
/deploy staging eu-west  →  args = ['staging', 'eu-west']
/status                  →  args = []
```

### `ctx: Record<string, string>`

The fully-resolved context that would be sent to the AI for this message — identical to what the engine sees in its `# Context` header. Includes all implicit keys plus any config vars and hook results:

| Key group | Description |
|-----------|-------------|
| `bot.*` | `bot.userId`, `bot.username`, `bot.firstName`, `bot.chatId`, `bot.messageId`, `bot.timestamp`, `bot.datetime`, `bot.messageType` |
| `sys.*` | `sys.date`, `sys.time`, `sys.datetime`, `sys.ts`, `sys.tz` |
| `project.*` | `project.name`, `project.cwd`, `project.slug` |
| `engine.*` | `engine.name`, `engine.command`, `engine.model` (if set), `engine.defaultModel` (if HAL default applied) |
| custom | Any keys defined in `context` config blocks, after `${}` / `#{}` / `@{}` substitution and context hook transforms |

Use `/context` (the built-in global command) to inspect the exact keys available at runtime.

### `gram: Grammy Context`

The raw [Grammy](https://grammy.dev) message context, giving direct access to the Telegram Bot API. Only needed for advanced use cases: sending multiple messages, editing or deleting messages, uploading files, reacting to messages, etc.

Common patterns:

```js
// Send a temporary status message, then delete it
const status = await gram.reply('Working...');
// ... do work ...
await gram.api.deleteMessage(gram.chat.id, status.message_id);

// Edit the status message while working
await gram.api.editMessageText(gram.chat.id, status.message_id, 'Still working...');

// React to the original message
await gram.react([{ type: 'emoji', emoji: '👍' }]);

// Send a file
await gram.replyWithDocument(new InputFile('/path/to/file.pdf'));
```

When using `gram` to send your own reply, return `null` or `undefined` to suppress the default text reply:

```js
export default async function({ gram }) {
  await gram.reply('Done!');
  return null;
}
```

### `agent: Agent`

An engine-agnostic interface for making one-shot AI calls from within a command. The underlying engine is configured per-project. Command handlers always use this interface and never talk to any engine directly.

```ts
interface Agent {
  call(
    prompt: string,
    options?: { onProgress?: (message: string) => void }
  ): Promise<string>;
}
```

Unlike regular user messages, agent calls have no session history and no context header prepended — the prompt is sent to the engine as-is.

| Option | Type | Description |
|--------|------|-------------|
| `onProgress` | `(message: string) => void` | Called during execution with activity updates (e.g. `"Reading: /path/to/file"`). Use it to keep the user informed while the agent is working. |

Returns the agent's final text output as a string. Throws on failure — the bot's command error handler will catch it and reply with `Command failed: {message}`.

```js
export default async function({ args, gram, agent }) {
  const status = await gram.reply('Thinking...');

  const answer = await agent.call(`Summarise: ${args.join(' ')}`, {
    onProgress: async (activity) => {
      try {
        await gram.api.editMessageText(gram.chat.id, status.message_id, `⏳ ${activity}`);
      } catch { /* ignore if message was already edited */ }
    },
  });

  await gram.api.deleteMessage(gram.chat.id, status.message_id);
  return answer;
}
```

See [`examples/.hal/commands/joke.mjs`](../../examples/.hal/commands/joke.mjs) for a full example that combines `gram` for live status cycling with `agent.call` + `onProgress` for activity updates.

### `projectCtx: ProjectContext`

The project-level context object. Useful fields:

| Field | Type | Description |
|-------|------|-------------|
| `projectCtx.config.name` | `string \| undefined` | Project name from config |
| `projectCtx.config.slug` | `string` | Internal slug (used for log/data paths) |
| `projectCtx.config.cwd` | `string` | Absolute path to the project directory |
| `projectCtx.config.configDir` | `string` | Absolute path to the directory containing the config file (e.g. `hal.config.yaml`) |
| `projectCtx.config.dataDir` | `string` | Absolute path to user data storage root |
| `projectCtx.config.context` | `Record<string, string> \| undefined` | Raw config-level context values (pre-hook) |
| `projectCtx.logger` | Pino logger | Structured logger — use for debug output that ends up in log files |

## Examples

- [`examples/obsidian/.hal/commands/status.mjs`](../../examples/obsidian/.hal/commands/status.mjs) — project-specific command using `projectCtx.config`
- [`examples/.hal/commands/context.mjs`](../../examples/.hal/commands/context.mjs) — global command that dumps the full resolved context
- [`examples/.hal/commands/joke.mjs`](../../examples/.hal/commands/joke.mjs) — global command using `agent.call` with live status cycling and `onProgress` updates

## Hot-reload

Commands (and [skills](../skills/README.md)) are **hot-reloaded** — drop a new `.mjs` file or `SKILL.md` into the relevant directory and the bot registers it with Telegram automatically, with no restart. The AI engine can write new command or skill files as part of a task and users see them in the `/` menu immediately.

## See also

- [Skills](../skills/README.md) — engine skill folders exposed as slash commands; can be overridden by a custom `.hal/commands/{name}.mjs` with the same name.
