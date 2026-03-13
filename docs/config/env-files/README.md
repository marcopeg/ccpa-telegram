# Env files

HAL uses env files to load environment variables for config substitution (`${VAR_NAME}` syntax). This page is the single canonical reference for everything related to env files: the two standard files and their roles, runtime loading precedence, wizard file selection, the custom `env` config key, and `.gitignore` guidance.

---

## Overview

Two env-file slots are available by default:

| File | Purpose |
|------|---------|
| `.env` | Variable declarations without real values — safe to commit |
| `.env.local` | Actual secret values (tokens, keys, IDs) — **gitignored** |

Both files live next to your config file (the config directory; default: the current working directory, or `--config-dir` when set). At runtime `.env.local` overrides `.env` for the same key, so you can keep `.env` as a template with placeholder values and put real values only in `.env.local`.

---

## Runtime loading precedence {#runtime-loading-precedence}

HAL supports two modes depending on whether the top-level `env` key is set in your config:

### Default mode (no `env` key)

Both `.env` and `.env.local` in the config directory are loaded automatically. Later sources override earlier ones.

Effective precedence (highest wins):

```
{config-dir}/.env.local  →  {config-dir}/.env  →  process.env
```

- `.env.local` wins over `.env`.
- Any variable not found in either file falls back to the shell environment (`process.env`).
- No per-project `.env` files are loaded; only the config-dir files.

### Explicit mode (`env` key set)

When the top-level `env` key points to a custom file (e.g. `env: "secrets.env"`), **only** that file and its `.local` sibling are loaded; the config-dir `.env`/`.env.local` are **not** loaded.

Effective precedence:

```
{custom}.local  →  {custom}  →  process.env
```

The `env` path is resolved relative to the config file's directory, or as an absolute path. Tilde (`~`) is expanded to your home directory.

### Conflict (boot error)

If `env` is set and points to a different file than `{config-dir}/.env`, and `{config-dir}/.env` or `{config-dir}/.env.local` also exists, the process exits at boot with an error. Use only one source: either remove `env` and use config-dir `.env` files, or remove/rename the config-dir `.env` files and use `env`.

### Missing custom file (boot error)

When `env` is set, the main file (the one you specified) must exist and be readable. If it is missing or unreadable, the process exits at boot with a clear error. The `.local` sibling remains optional.

### Watcher

When `env` is set, the config watcher also watches the custom env path and its `.local` sibling. Changes to either file (or creation of the `.local` file after startup) trigger a config reload.

### Example (default mode)

```bash
# {config-dir}/.env  (safe to commit — variable declarations, no real secrets)
BACKEND_BOT_TOKEN=
FRONTEND_BOT_TOKEN=

# {config-dir}/.env.local  (gitignored — actual secret values go here)
BACKEND_BOT_TOKEN=7123456789:AAHActual-token-here
FRONTEND_BOT_TOKEN=7987654321:AAHAnother-token-here
```

On every boot an `info`-level log lists all config and env files that were loaded, in order.

---

## Wizard file selection {#wizard-file-selection}

When the setup wizard writes secrets to an env file, it uses the following rules to determine which file to use:

| State on disk | Wizard behavior |
|---|---|
| Neither `.env` nor `.env.local` exists | Write to `.env` (no prompt) |
| Only `.env.local` exists | **Prompt**: write to `.env.local`, or stop |
| Only `.env` exists | **Prompt**: write to `.env`, create `.env.local`, or stop |
| Both `.env` and `.env.local` exist | **Prompt**: write to `.env`, write to `.env.local`, or stop |

When a prompt is shown, three options are offered: the applicable file path(s) and **Stop / don't write env file**.

Selecting **Stop** causes the wizard to skip the env file write entirely and exit cleanly with a message. No partial writes occur — the config file is still written, but env entries are skipped. You can set the values manually afterward.

**Note:** If the `env` config key is already set in your existing config, the wizard uses that custom path directly and bypasses the selection logic above.

---

## Custom `env` config key {#custom-env-key}

Add `env` at the top level of your config to override the default env file location:

```yaml
env: "secrets.env"
```

When this key is set:

- Only `secrets.env` and `secrets.env.local` (in the same directory) are loaded.
- The config-dir `.env`/`.env.local` are **not** loaded.
- The wizard uses this path directly, without prompting for file selection.

See [Runtime loading precedence](#runtime-loading-precedence) above for full details.

---

## `.gitignore` guidance {#gitignore}

Add `.env.local` to your `.gitignore` to prevent committing real secrets. If your `.env` also contains real values (not just declarations), add that too.

Recommended `.gitignore` entries:

```
.env.local
*.env.local
```

Example workflow:

1. Commit `.env` with empty or placeholder values — it documents what variables are needed.
2. Keep `.env.local` gitignored — it holds the actual values on each machine.
3. Team members copy `.env` → `.env.local` and fill in their own credentials.
