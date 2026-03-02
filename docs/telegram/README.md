# Telegram

## Creating a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot`
3. Choose a display name (e.g. "My Backend Assistant")
4. Choose a username ending in `bot` (e.g. `my_backend_assistant_bot`)
5. Add the token to `.env.local` and reference it via `${VAR_NAME}` in `hal.config.json`

For each project you need a separate bot and token.

## Finding Your Telegram User ID

1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your numeric user ID
3. Add it to `allowedUserIds` in your project config (or globals) so the bot accepts your messages.
