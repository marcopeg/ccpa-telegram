---
name: hal-command-author
description: Authors high-quality HAL slash commands (.hal/commands/<name>.mjs) following project conventions.
public: false
---

# HAL Command Author

Your job is to produce a production-ready `.hal/commands/<name>.mjs` file (and any needed config edits) whenever the user asks to **create or modify a HAL slash command**.

## What to do

1. Understand the command's purpose from the user's request.
2. Inspect existing commands for patterns — look in `.hal/commands/*.mjs` first, then `examples/.hal/commands/*.mjs`.
3. Apply all conventions in the **checklist** below before calling the command done.
4. Write (or edit) the file at the correct path. If the project config needs changes, make those too.

---

## Conventions (enforced)

### 1 — File location

```
{project.cwd}/.hal/commands/{name}.mjs        ← project-specific
{configDir}/.hal/commands/{name}.mjs           ← global (all projects)
```

Project-specific takes precedence on name collision.

### 2 — Required exports

```js
export const description = '…';   // ≤ 256 chars — shown in Telegram /command menu

export default async function handler({ args, ctx, gram, agent, projectCtx }) {
  // …
}
```

Both exports are mandatory. `description` must be a non-empty string under 256 characters.

### 3 — Return rules

| Return value | Effect |
|---|---|
| `string` | HAL sends it as the reply message |
| `null` / `undefined` | Suppresses the default reply — use when you've already called `gram` yourself |

Never return `null` and also call `gram.reply()` without deleting the HAL processing message first.

### 4 — Path & time resolution

```js
// Correct — use context variables, not process.cwd()
const cwd = ctx['project.cwd'];         // project root
const now = Number(ctx['sys.ts']);       // Unix timestamp (seconds)
const { config } = projectCtx;          // full resolved config object
const cwd2 = config.cwd;                // same as ctx['project.cwd']
```

Never assume `process.cwd()` equals the project root — HAL may be run from any directory.

### 5 — Telegram message size limits

Telegram hard-caps messages at ~4 096 characters. If output may exceed that, write it to a temp file and send it as a document:

```js
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InputFile } from 'grammy';

// Inside the handler:
const output = buildLongOutput();
if (output.length > 3800) {
  const filePath = join(ctx['project.cwd'], '.hal', 'tmp', `${ctx['sys.ts']}-output.txt`);
  await writeFile(filePath, output, 'utf-8');
  await gram.replyWithDocument(new InputFile(filePath));
  return null;   // ← suppress default reply
}
return output;
```

### 6 — AI usage (determinism first)

- **Default to deterministic code** — no `agent.call()` unless the user explicitly wants AI-generated content.
- When using `agent.call()`, always show a status message and handle errors.

```js
const status = await gram.reply('_Working…_', { parse_mode: 'Markdown' });
try {
  const result = await agent.call(prompt, {
    onProgress: async (msg) => {
      try { await gram.api.editMessageText(gram.chat.id, status.message_id, `_${msg}_`, { parse_mode: 'Markdown' }); } catch {}
    },
  });
  await gram.api.deleteMessage(gram.chat.id, status.message_id);
  return result;
} catch (err) {
  await gram.api.deleteMessage(gram.chat.id, status.message_id);
  throw err;
}
```

### 7 — Arg parsing

```js
// String arg with fallback
const target = args[0] ?? 'default';

// Integer arg with validation
const count = args[0] ? Number.parseInt(args[0], 10) : 10;
if (Number.isNaN(count) || count < 1) return 'Usage: /cmd <positive-integer>';

// Flag detection
const showAll = args.includes('all') || args.includes('--all');

// Named value  --key value
const keyIdx = args.indexOf('--key');
const keyValue = keyIdx !== -1 ? args[keyIdx + 1] : undefined;
```

Always return a clear usage string (not throw) when args are invalid.

### 8 — Code style

- Small, pure helper functions — no global state.
- Handle errors explicitly; re-throw only when you want HAL to surface "Command failed: …".
- ESM `.mjs` — no `require()`, no top-level `await` outside functions.

---

## References

- `references/command-template.mjs` — minimal skeleton to copy-paste
- `references/patterns.md` — ready-to-use code snippets
- `references/review-checklist.md` — run through this before finishing

## See also

- `docs/custom-commands/README.md` — authoritative command format docs
- `docs/skills/README.md` — skill format docs
- `AGENTS.md` — project tech stack and key patterns
