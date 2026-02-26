---
name: hal_command
description: Build or modify custom slash commands for @marcopeg/hal Telegram bots. Use this skill whenever the user asks to create or change a custom Telegram command (for example “create a command name foo that does x, y, z”).
---

## Goal

Implement a working `.mjs` command file in the correct `.hal/commands` folder, following HAL runtime behavior exactly.

## Command locations

Create command files in the project's command directory:

- `{project.cwd}/.hal/commands/<name>.mjs`

## Naming convention (required)

Telegram command names must match `^[a-z0-9_]{1,32}$`.

Rules:

- only lowercase letters, numbers, and underscore
- no hyphens, spaces, dots, or uppercase letters
- length must be between 1 and 32 characters
- skill folder name and command filename must use the same valid command name

Examples:

- valid: `foo`, `build_v2`, `release2026`
- invalid: `foo-bar`, `Foo`, `foo.bar`, `my command`

## Required file shape

The command name is the filename without `.mjs`.
Each command file must export:

- `description` (string) → shown in Telegram `/` command list
- `default` (async function) → command handler

Template:

```js
export const description = "Describe what /foo does";

export default async function ({ args, ctx, gram, agent, projectCtx }) {
	// your logic
	return "Done";
}
```

## Handler contract

Handler input object:

- `args: string[]` → tokenized command arguments (`/foo a b` => `['a', 'b']`)
- `ctx: Record<string, string>` → resolved runtime context (`bot.*`, `sys.*`, `project.*`, config context, hook output)
- `gram` → raw Grammy context for Telegram API actions (reply/edit/delete/send file)
- `agent` → one-shot AI caller: `agent.call(prompt, { onProgress })`
- `projectCtx` → project runtime context (`config`, `logger`, `bootContext`)

Return behavior:

- return string => bot sends it to Telegram
- return `null`/`undefined` => no automatic reply (use `gram.reply(...)` manually)
- throw error => bot replies with `Command failed: <message>`

## Implementation rules

When user asks “create command `<name>` that does ...”:

1. Normalize/validate `<name>` against `^[a-z0-9_]{1,32}$`; if invalid, convert to a valid snake_case name and state the rename explicitly.
2. Create/update `.hal/commands/<name>.mjs` in the requested scope.
3. Implement exactly the requested behavior (no unrelated features).
4. Keep command robust:
	 - parse `args` safely with defaults
	 - validate required arguments and return helpful usage text
	 - catch expected failures only when you can provide a better message
5. Use `gram` only when needed for advanced UX (status updates, message edits, file sending).
6. Use `agent.call(...)` only when the command truly needs AI reasoning.

## Hot reload and discoverability

Command files are hot-reloaded by HAL.
After saving a valid `.mjs` command with a `description`, it is re-registered in Telegram automatically and appears in the slash menu.

## Practical output format when fulfilling user requests

When you build a command for the user, provide:

- file path created/updated
- short behavior summary
- usage examples (1–3 command examples)
- any assumptions (if arguments/behavior were inferred)