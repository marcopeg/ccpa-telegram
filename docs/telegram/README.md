# Telegram

HAL runs one Telegram bot per project. You need two things before starting:

1. **A bot token** — so Telegram knows which bot your config is running.
2. **Your user ID** — required so the bot can restrict access and associate your messages with your session.

Follow the two sections below. Both are required to set up your first project.

---

## Creating a Telegram Bot

You get a bot token from **BotFather**, Telegram’s official bot for creating and managing bots.

### Step 1: Open a chat with BotFather

- In Telegram (app or desktop), search for **@BotFather** or open: [https://t.me/BotFather](https://t.me/BotFather).
- Start a chat and send any message if prompted.

### Step 2: Create a new bot

1. Send the command: **`/newbot`**
2. **Display name** — BotFather will ask for a name that users see (e.g. “My Backend Assistant”). This can be changed later.
3. **Username** — Next, choose a **username** that must end in `bot` (e.g. `my_backend_assistant_bot`). It must be unique across Telegram and cannot be changed later.

### Step 3: Copy the token

- BotFather will reply with a **token** that looks like:  
  `7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- **Copy this token** and keep it secret. Anyone with the token can control your bot.
- You can get the token again later by sending `/mybots` to BotFather, selecting your bot, then **API Token**.

### Step 4: Add the token to HAL

- **Do not** put the token directly in your config file if it is committed to git.
- Put it in a **`.env.local`** file in the same directory as your config (the directory where you run the HAL CLI). Example:

  ```bash
  # .env.local  (create this file next to hal.config.yaml)
  BACKEND_BOT_TOKEN=7123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
  ```

- In your config, reference it with a placeholder:

  ```yaml
  projects:
    backend:
      cwd: ./backend
      telegram:
        botToken: "${BACKEND_BOT_TOKEN}"
  ```

- HAL resolves `${BACKEND_BOT_TOKEN}` at startup from `.env.local` (or `.env` or the shell environment). See [Env files](../config/env-files/README.md) for details on loading precedence and `.gitignore` guidance.

### One bot per project

Each HAL project uses a **separate** bot and token. If you have two projects (e.g. backend and frontend), create two bots with BotFather and use two different env vars and tokens in your config.

---

## Finding Your Telegram User ID

HAL uses your **Telegram user ID** (a numeric ID) for access control and per-user sessions. You need this number to add yourself to `allowedUserIds` so the bot accepts your messages. HAL refuses to start without an allowlist unless you explicitly opt into unrestricted access.

### Step 1: Get your user ID

1. In Telegram, open a chat with **@userinfobot**: [https://t.me/userinfobot](https://t.me/userinfobot).
2. Send any message (e.g. “Hi”).
3. The bot replies with your profile info, including **Id:** followed by a number (e.g. `123456789`). That number is your **Telegram user ID**.

### Step 2: Add it to HAL config

- In your config, set **`allowedUserIds`** so that only you (and any other allowed users) can use the bot. If the list is empty, HAL refuses to start unless you explicitly set `dangerouslyAllowUnrestrictedAccess: true`.

  **Globally (all projects):**

  ```yaml
  globals:
    access:
      allowedUserIds: [123456789]
  ```

  **Per project:**

  ```yaml
  projects:
    backend:
      cwd: ./backend
      telegram:
        botToken: "${BACKEND_BOT_TOKEN}"
      access:
        allowedUserIds: [123456789]
  ```

- Use your **numeric** ID (no quotes). You can add multiple IDs: `[123456789, 987654321]`.
- You can also use **strings** so the value comes from the environment: e.g. `["${TELEGRAM_USER_ID}"]` in config and set `TELEGRAM_USER_ID=123456789` in `.env.local`. See [Env files](../config/env-files/README.md) and [Access control](../config/README.md#access-control).
- Users whose ID is not in the list will not be able to use that bot when the allowlist is enabled.

### Why use allowedUserIds?

- Restricts who can talk to your bot.
- Keeps your bot private for development or team use.
- Required for HAL’s access control; only use `dangerouslyAllowUnrestrictedAccess: true` if you intend to allow everyone (not recommended for tokens you care about).

[← Back to documentation index](../README.md)
