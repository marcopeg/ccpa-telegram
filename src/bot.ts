import { Bot } from "grammy";
import {
  createGitCallbackHandler,
  createGitCleanHandler,
  createGitCommitHandler,
  createGitInitHandler,
  createGitStatusHandler,
} from "./bot/commands/git/index.js";
import { createHelpHandler } from "./bot/commands/help.js";
import {
  type CommandEnabledFlags,
  loadCommands,
} from "./bot/commands/loader.js";
import {
  createResetCallbackHandler,
  createResetHandler,
} from "./bot/commands/reset.js";
import { clearAllPrompts } from "./bot/commands/resetPrompt.js";
import { createCleanHandler } from "./bot/commands/session.js";
import { createStartHandler } from "./bot/commands/start.js";
import { startCommandWatcher } from "./bot/commands/watcher.js";
import {
  createDocumentHandler,
  createPhotoHandler,
  createTextHandler,
  createVoiceHandler,
} from "./bot/handlers/index.js";
import { createAuthMiddleware } from "./bot/middleware/auth.js";
import { createRateLimitMiddleware } from "./bot/middleware/rateLimit.js";
import type { ProjectContext } from "./types.js";

export interface BotHandle {
  stop: () => Promise<void>;
}

/**
 * Start a single bot for one project context.
 * Resolves when the bot is fully running; rejects if startup fails.
 * Returns a handle with a stop() function for graceful shutdown.
 */
export async function startBot(projectCtx: ProjectContext): Promise<BotHandle> {
  const { config, logger, engine } = projectCtx;

  logger.info({ cwd: config.cwd, dataDir: config.dataDir }, "Starting bot");

  // Verify the engine CLI is available (throws on failure)
  logger.debug(
    { engine: config.engine, command: engine.command },
    "Checking engine CLI",
  );
  engine.check();
  logger.info(
    { engine: config.engine, command: engine.command },
    "Engine CLI verified",
  );

  const bot = new Bot(config.telegram.botToken);

  // Wire per-bot middleware
  const { middleware: rateLimitMw, cleanup: rateLimitCleanup } =
    createRateLimitMiddleware(projectCtx);
  bot.use(createAuthMiddleware(projectCtx));
  bot.use(rateLimitMw);

  // Wire commands (only when enabled)
  const cmd = config.commands;
  if (cmd.start.enabled) bot.command("start", createStartHandler(projectCtx));
  if (cmd.help.enabled) bot.command("help", createHelpHandler(projectCtx));
  if (cmd.reset.enabled) {
    bot.command("reset", createResetHandler(projectCtx, bot.api));
    bot.on("callback_query:data", createResetCallbackHandler(projectCtx));
  }
  if (cmd.clean.enabled) bot.command("clean", createCleanHandler(projectCtx));

  if (cmd.git.enabled) {
    bot.command("git_init", createGitInitHandler(projectCtx));
    bot.command("git_status", createGitStatusHandler(projectCtx));
    bot.command("git_commit", createGitCommitHandler(projectCtx));
    bot.command("git_clean", createGitCleanHandler(projectCtx));
    bot.on("callback_query:data", createGitCallbackHandler(projectCtx));
  }

  // Wire handlers
  bot.on("message:text", createTextHandler(projectCtx));
  bot.on("message:photo", createPhotoHandler(projectCtx));
  bot.on("message:document", createDocumentHandler(projectCtx));
  bot.on("message:voice", createVoiceHandler(projectCtx));

  // Error handler
  bot.catch((err) => {
    logger.error({ error: err.error, ctx: err.ctx?.update }, "Bot error");
  });

  // Signal when the bot has started (or failed to start)
  let resolveStarted: () => void;
  let rejectStarted: (err: unknown) => void;
  const startedPromise = new Promise<void>((res, rej) => {
    resolveStarted = res;
    rejectStarted = rej;
  });

  // Start bot — runs until stopped, do not await here
  const runningPromise = bot
    .start({
      onStart: (botInfo) => {
        logger.info(
          { username: botInfo.username, slug: config.slug },
          "Bot is running",
        );
        resolveStarted();
      },
    })
    .catch((err) => {
      rejectStarted(err);
    });

  // Wait until the bot reports it's running (or fails)
  await startedPromise;

  // Derive enabled flags from resolved config
  const enabledFlags: CommandEnabledFlags = {
    start: cmd.start.enabled,
    help: cmd.help.enabled,
    reset: cmd.reset.enabled,
    clean: cmd.clean.enabled,
    git: cmd.git.enabled,
  };

  // Register project-specific commands and skills with Telegram on startup
  const skillsDirs = engine.skillsDirs(config.cwd);
  const commands = await loadCommands(
    config.cwd,
    config.configDir,
    logger,
    skillsDirs,
    enabledFlags,
  );
  if (commands.length > 0) {
    await bot.api.setMyCommands(
      commands.map((c) => ({ command: c.command, description: c.description })),
    );
    logger.info(
      { count: commands.length },
      "Commands registered with Telegram",
    );
  }

  // Start file watcher for hot-reload of command and skill files
  const watcher = startCommandWatcher(
    bot,
    config.cwd,
    config.configDir,
    logger,
    skillsDirs,
    enabledFlags,
  );

  return {
    stop: async () => {
      await watcher.stop();
      clearAllPrompts();
      rateLimitCleanup();
      await bot.stop(); // Stops polling; Grammy waits for in-flight updates to finish
      await runningPromise;
    },
  };
}
