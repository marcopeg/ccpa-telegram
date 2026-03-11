# Setup wizard

The setup wizard is the recommended way to create or complete your HAL config. It runs interactively and guides you through project name, directory, Telegram bot token, user ID, engine/model, and session settings. It respects any existing config and only asks for what’s missing.

## When the wizard runs

**Explicit:** run it directly:

```bash
npx @marcopeg/hal wiz
```

**Suggested on start:** when you run `start` (the default command) with no config or an incomplete one, HAL will **detect it** and (in an interactive terminal) **ask if you want to run the wizard**. So:

- First time in a new directory: `npx @marcopeg/hal` → you’ll be prompted to run the wizard.
- Config missing or missing required fields (e.g. no bot token, no user ID): same behavior.
- Non-interactive (CI, Docker, pipe): no prompt; you get the usual error and the suggestion to run `wiz`.

After the wizard finishes, it can write the config and then either start the bot or exit.

## Prerequisites

Before or during the wizard you’ll need:

- A **Telegram bot token** from [@BotFather](https://t.me/BotFather) — see [Creating a Telegram bot](../telegram/README.md#creating-a-telegram-bot).
- Your **Telegram user ID** — see [Finding your Telegram user ID](../telegram/README.md#finding-your-telegram-user-id).
- At least one supported **engine** installed and authenticated — see [Engines](../engines/README.md).

The wizard will prompt for bot token and user ID if they’re not already in the config; you can also pre-fill them with flags (see below).

## Pre-fill flags

You can skip steps by providing values on the command line. When a flag is set and valid, that step is skipped and the value is applied.

| Flag | Step skipped |
|------|----------------------|
| `--name <value>` | Project display name |
| `--cwd <path>` | Project working directory |
| `--engine <name>` | Engine selection |
| `--model <name>` | Model selection (with engine) |
| `--api-key <value>` | Telegram bot token |
| `--user-id <value>` | Telegram user ID |
| `--session <mode>` | Session configuration (`true`, `false`, `shared`, `user`) |

Examples:

```bash
# Only set engine; wizard asks for the rest
npx @marcopeg/hal wiz --engine cursor

# Pre-fill engine and model
npx @marcopeg/hal wiz --engine codex --model gpt-5.2-codex

# Pre-fill bot token and user ID (e.g. for scripts)
npx @marcopeg/hal wiz --api-key 123:ABC... --user-id 7974709349
```

Invalid values (e.g. unknown engine) cause the wizard to prompt for that step instead of failing.

## Re-asking everything

Use `--reset` to run the wizard as if no config existed: every step is shown and current values can be overridden.

```bash
npx @marcopeg/hal wiz --reset
```

## Config directory and format

- **Config directory:** by default the wizard uses the current working directory. Use `--config-dir <path>` to run the wizard (and write config) in another directory.
- **Existing config:** if a config file already exists, the wizard updates it in place and keeps the same format (YAML, JSON, or JSONC). If no config exists, it creates e.g. `hal.config.yaml` in the config directory.
- **Secrets:** the wizard can store the bot token (and user IDs) in env files and put placeholders in the config so secrets aren’t committed. By default it writes to a single env file **in the config directory** (the directory where you run the CLI). Selection order: if `env` is configured, use that file; otherwise `.env` if it exists, else `.env.local` if it exists, otherwise create `.env`. Bot token placeholders are per-project (based on the project key), e.g. `${MYBOT_TELEGRAM_TOKEN}`; user IDs use `${TELEGRAM_USER_ID}`, `${TELEGRAM_USER_ID_2}`, … See [Configuration — Environment variable substitution](../config/README.md#environment-variable-substitution) for details on env files and resolution.

## Legacy: `init` command

The non-interactive `init` command still works but is deprecated. It creates a config from a template and supports flags like `--engine`, `--model`, `--cwd`. Prefer `wiz` for interactive setup; the wizard can do everything `init` does and more.
