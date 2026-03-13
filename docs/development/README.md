# Development

Guide for contributors: local setup, running the bot, and releasing.

## Requirements

- **Node.js** 18+
- **ffmpeg** — required for voice messages (`brew install ffmpeg` on macOS)
- At least one supported AI coding CLI installed and authenticated — see [Engines](../engines/README.md)
- A Telegram bot token and your user ID — see [Telegram](../telegram/README.md)

## Quick start

```bash
npm install
npm start
```

The `start` script runs the bot with `--config-dir examples`, so HAL uses the config and env from the `examples/` folder. You must create your own env file there before it will work.

## Examples folder and `.env`

The `examples/` folder contains a sample config (`hal.config.yaml`) that uses `${VAR_NAME}` placeholders for secrets (bot tokens, user IDs, etc.). HAL loads env from the config directory at boot:

- `examples/.env`
- `examples/.env.local` (overrides `.env`, both are gitignored)

**You need to create `examples/.env`** (or `examples/.env.local`) with the variables referenced in `examples/hal.config.yaml`. For example:

```bash
# examples/.env

# Your Telegram user ID (required for access)
USER_MARCO_IPHONE_ID=123456789

# Bot tokens for each project in hal.config.yaml
OBSIDIAN_TELEGRAM_TOKEN=7123456789:AAHActual-token-here
TIMETRACKER_TELEGRAM_TOKEN=7123456789:AAHAnother-token-here
```

Replace the placeholder names and values with your own. See [Telegram](../telegram/README.md) for creating a bot and finding your user ID. The config structure is in [Configuration](../config/README.md).

## Release and publish

Releases use [release-it](https://github.com/release-it/release-it) with [conventional commits](https://www.conventionalcommits.org/). The flow is split: version and changelog stay local until you run the push step; publish runs in your terminal so the browser/OTP flow works with 2FA.

### Relevant scripts

| Script | What it does |
|--------|----------------|
| **release:patch** | Lint → build (fails if either fails) → bump patch → update `CHANGELOG.md` → commit → tag. Does **not** push or publish. |
| **release:minor** | Same as above with minor bump. |
| **release:major** | Same as above with major bump. |
| **release:push** | Pushes the release commit and tag to the remote, then runs `npm publish --access public`. |
| **release** | Interactive: release-it prompts for version bump and options. |
| **deploy** | Alias for `release:patch`. |

**prepare** runs on `npm install` (sets up husky). **prepublishOnly** runs automatically before publish (runs build).

### Process

1. **Clean tree** — Commit or stash all changes. release-it will refuse to run if the working directory is dirty.
2. **Version + changelog (local only)** — Run one of:
   - `npm run release:patch`
   - `npm run release:minor`
   - `npm run release:major`
   Each runs lint and build first; if either fails, the script stops. Then it bumps the version, updates `CHANGELOG.md`, commits, and creates the tag. Nothing is pushed.
3. **Push and publish** — When ready: `npm run release:push`. This pushes the commit and tag, then runs `npm publish --access public`.

### Local token for publish (no OTP)

If your npm account uses 2FA, you can use an **automation token** so you don't need to enter OTP each time:

1. **Create the token** — On [npmjs.com](https://www.npmjs.com): Account → Access Tokens → Generate New Token → **Automation**.
2. **Store it in the project root** — Create a gitignored `.env` in the project root (not in `examples/`):

   ```bash
   # .env (project root, gitignored)
   export NPM_TOKEN=npm_xxxxxxxxxxxxxxxx
   ```

   Replace with your actual token. The `export` is required so child processes receive the variable.
3. **Configure npm** — The project `.npmrc` already contains:

   ```
   //registry.npmjs.org/:_authToken=${NPM_TOKEN}
   ```

   npm reads `NPM_TOKEN` from the environment.
4. **Run publish** — Before `release:push`, load the env:

   ```bash
   source .env
   npm run release:push
   ```

   Or in one line: `source .env && npm run release:push`.

### Summary

| Step | Command |
|------|---------|
| Version + changelog | `npm run release:patch` (or minor/major) |
| Publish (with token) | `source .env && npm run release:push` |
| Publish (with 2FA) | `npm run release:push` (npm will prompt for OTP in browser when you have 2FA) |

Config: [.release-it.json](../../.release-it.json) (conventional-commits preset, `CHANGELOG.md` at repo root).
