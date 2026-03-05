# HAL command patterns

Ready-to-use snippets for common scenarios.

---

## Context & path resolution

```js
// Project root — always use this, never process.cwd()
const cwd = ctx['project.cwd'];

// Current timestamp (Unix seconds)
const now = Number(ctx['sys.ts']);

// Full config object (name, cwd, engine, etc.)
const { config } = projectCtx;
const projectName = config.name ?? config.slug;

// User info
const userId = ctx['bot.userId'];
const firstName = ctx['bot.firstName'];
```

---

## Arg parsing

```js
// String with fallback
const topic = args[0] ?? 'default';

// Integer with validation
const n = args[0] ? Number.parseInt(args[0], 10) : 10;
if (Number.isNaN(n) || n < 1) return 'Usage: /cmd <positive-integer>';

// Boolean flag  /cmd all  or  /cmd --all
const showAll = args.includes('all') || args.includes('--all');

// Named value  /cmd --env production
const envIdx = args.indexOf('--env');
const env = envIdx !== -1 ? (args[envIdx + 1] ?? null) : null;
if (!env) return 'Usage: /cmd --env <name>';

// Remainder of args as a phrase
const phrase = args.slice(1).join(' ') || 'default phrase';
```

---

## Long output → send as file

Use when output could exceed ~3 800 characters.

```js
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InputFile } from 'grammy';

// Inside handler:
const output = buildReport();
if (output.length > 3800) {
  const tmpDir = join(ctx['project.cwd'], '.hal', 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const filePath = join(tmpDir, `${ctx['sys.ts']}-report.txt`);
  await writeFile(filePath, output, 'utf-8');
  await gram.replyWithDocument(new InputFile(filePath), { caption: 'Report (too long for a message)' });
  return null;   // suppress default reply
}
return output;
```

---

## Status message + agent call

Show a status message, stream progress, then delete on completion.

```js
const status = await gram.reply('_Working…_', { parse_mode: 'Markdown' });
let lastUpdate = Date.now();

try {
  const result = await agent.call(
    `Your prompt here`,
    {
      onProgress: async (msg) => {
        const now = Date.now();
        if (now - lastUpdate < 2000) return;   // throttle to 1 update / 2 s
        lastUpdate = now;
        try {
          await gram.api.editMessageText(
            gram.chat.id,
            status.message_id,
            `_${msg}_`,
            { parse_mode: 'Markdown' },
          );
        } catch {}
      },
    },
  );
  await gram.api.deleteMessage(gram.chat.id, status.message_id);
  return result;
} catch (err) {
  await gram.api.deleteMessage(gram.chat.id, status.message_id);
  throw err;   // HAL will surface "Command failed: <message>"
}
```

---

## Multiple messages / reactions

```js
// Delete processing message before sending your own reply
await gram.api.deleteMessage(gram.chat.id, status.message_id);
await gram.reply('First message');
await gram.reply('Second message');
return null;   // suppress default reply

// React to the user's original message
await gram.react([{ type: 'emoji', emoji: '👍' }]);
return null;
```

---

## Reading files from the project

```js
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const cwd = ctx['project.cwd'];
const content = await readFile(join(cwd, 'path/to/file.txt'), 'utf-8');
```

---

## Error handling patterns

```js
// Return error string (no stack trace to user)
try {
  const data = await riskyOperation();
  return formatData(data);
} catch (err) {
  return `Failed: ${err instanceof Error ? err.message : String(err)}`;
}

// Re-throw (HAL surfaces "Command failed: <message>")
try {
  await criticalOperation();
} catch (err) {
  throw err;
}

// Specific error types
if (!existsSync(filePath)) {
  return `File not found: ${filePath}`;
}
```
