import { Bot } from "grammy";
import { createHelpHandler } from "./bot/commands/help.js";
import { loadCommands } from "./bot/commands/loader.js";
import { createResetHandler } from "./bot/commands/reset.js";
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

  // Wire commands
  bot.command("start", createStartHandler(projectCtx));
  bot.command("help", createHelpHandler(projectCtx));
  bot.command("reset", createResetHandler(projectCtx));
  bot.command("clean", createCleanHandler(projectCtx));

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

  // Register project-specific commands and skills with Telegram on startup
  const skillsDir = engine.skillsDir(config.cwd);
  const commands = await loadCommands(
    config.cwd,
    config.configDir,
    logger,
    skillsDir,
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
    skillsDir,
  );

  return {
    stop: async () => {
      await watcher.stop();
      rateLimitCleanup();
      await bot.stop(); // Stops polling; Grammy waits for in-flight updates to finish
      await runningPromise;
    },
  };
}
