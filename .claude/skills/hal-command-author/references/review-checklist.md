# HAL command review checklist

Run through every item before considering a command done.

---

## Exports

- [ ] `export const description` is present and is a non-empty string
- [ ] `description` is ≤ 256 characters (Telegram hard limit)
- [ ] `export default async function handler(…)` is present
- [ ] No other top-level exports or global mutable state

## File location

- [ ] File is at `.hal/commands/<name>.mjs` (project-specific) or `{configDir}/.hal/commands/<name>.mjs` (global)
- [ ] Filename matches the intended command name (no leading slash)
- [ ] Extension is `.mjs` (not `.js`, `.ts`, etc.)

## Handler signature

- [ ] Destructures only from `{ args, ctx, gram, agent, projectCtx }` — no positional args
- [ ] No extra parameters added to the signature

## Path & context resolution

- [ ] Uses `ctx['project.cwd']` (or `config.cwd`) for all file paths — **not** `process.cwd()`
- [ ] Uses `ctx['sys.ts']` for timestamps where needed
- [ ] Does not hardcode absolute paths

## Return value

- [ ] Returns a `string` when sending a text reply
- [ ] Returns `null` or `undefined` when using `gram` to send the reply directly
- [ ] Never returns `null` while also leaving a pending "Processing…" message uncleaned

## Telegram size limits

- [ ] If output can exceed ~3 800 chars: falls back to `gram.replyWithDocument(new InputFile(…))` + `return null`
- [ ] No single reply is unconditionally built from unbounded data (files, lists, etc.) without a size guard

## AI usage

- [ ] `agent.call()` is only used when the user explicitly needs AI-generated content
- [ ] Every `agent.call()` has a visible status message and an `onProgress` handler
- [ ] Status message is deleted (or edited to final state) after `agent.call()` resolves or throws

## Arg parsing

- [ ] Args are validated before use; invalid args return a `'Usage: /cmd …'` string (not throw)
- [ ] Integer args use `Number.parseInt(args[n], 10)` with `Number.isNaN()` guard
- [ ] Default values are provided for optional args

## Error handling

- [ ] Errors that should surface to the user are either returned as strings or re-thrown
- [ ] No silent `catch {}` blocks that hide real failures
- [ ] Status messages are always cleaned up even on error paths

## Code style

- [ ] No `require()` — ESM only (`.mjs`)
- [ ] No `await` at the top level (outside a function)
- [ ] No global mutable variables
- [ ] Helper functions are small and pure where possible
- [ ] Comments explain *why*, not *what*
