import { Bot } from "grammy";
import { createEngineHandler } from "./bot/commands/engine.js";
import { createEngineCallbackHandler } from "./bot/commands/engine-callback.js";
import {
  createGitCallbackHandler,
  createGitCleanHandler,
  createGitCommitHandler,
  createGitInitHandler,
  createGitStatusHandler,
} from "./bot/commands/git/index.js";
import { createHelpHandler } from "./bot/commands/help.js";
import { createInfoHandler } from "./bot/commands/info.js";
import {
  type CommandEnabledFlags,
  commandsForTelegramMenu,
  getCommandsWithDescriptionTooLong,
  loadCommands,
} from "./bot/commands/loader.js";
import { createModelHandler } from "./bot/commands/model.js";
import { createModelCallbackHandler } from "./bot/commands/model-callback.js";
import {
  createNpmCallbackHandler,
  createNpmHandler,
} from "./bot/commands/npm/index.js";
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
  createMjsCallbackDispatcher,
  createPhotoHandler,
  createTextHandler,
  createVoiceHandler,
} from "./bot/handlers/index.js";
import { createAuthMiddleware } from "./bot/middleware/auth.js";
import { createRateLimitMiddleware } from "./bot/middleware/rateLimit.js";
import type { ProjectContext } from "./types.js";

export interface BotHandle {
  stop: () => Promise<void>;
  /** The Grammy Bot instance for this project. Used by the cron scheduler to send messages. */
  bot: Bot;
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

  const debounceActiveUsers = new Set<number>();

  // Wire per-bot middleware
  const { middleware: rateLimitMw, cleanup: rateLimitCleanup } =
    createRateLimitMiddleware(projectCtx, debounceActiveUsers);
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
  if (cmd.info.enabled) bot.command("info", createInfoHandler(projectCtx));

  if (cmd.git.enabled) {
    bot.command("git_init", createGitInitHandler(projectCtx));
    bot.command("git_status", createGitStatusHandler(projectCtx));
    bot.command("git_commit", createGitCommitHandler(projectCtx));
    bot.command("git_clean", createGitCleanHandler(projectCtx));
    bot.on("callback_query:data", createGitCallbackHandler(projectCtx));
  }

  if (cmd.npm.enabled) {
    bot.command("npm", createNpmHandler(projectCtx));
    bot.on("callback_query:data", createNpmCallbackHandler(projectCtx));
  }

  // When disabled, catch /model and /engine (and their callbacks) so we reply instead of sending to the LLM
  if (!cmd.model.enabled) {
    bot.hears(/^\/model(@\w+)?(\s|$)/i, (ctx) =>
      ctx.reply("This command is disabled."),
    );
  } else {
    bot.command("model", createModelHandler(projectCtx));
    bot.on("callback_query:data", createModelCallbackHandler(projectCtx));
  }

  if (!cmd.engine.enabled) {
    bot.hears(/^\/engine(@\w+)?(\s|$)/i, (ctx) =>
      ctx.reply("This command is disabled."),
    );
  } else {
    bot.command("engine", createEngineHandler(projectCtx));
    bot.on("callback_query:data", createEngineCallbackHandler(projectCtx));
  }

  if (!cmd.info.enabled) {
    bot.hears(/^\/info(@\w+)?(\s|$)/i, (ctx) =>
      ctx.reply("This command is disabled."),
    );
  }

  // Answer old inline buttons for /model and /engine when those commands are disabled
  bot.on("callback_query:data", async (ctx, next) => {
    const data = ctx.callbackQuery?.data ?? "";
    const engineDisabled = data.startsWith("en:") && !cmd.engine.enabled;
    const modelDisabled = data.startsWith("md:") && !cmd.model.enabled;
    if (engineDisabled || modelDisabled) {
      await ctx.answerCallbackQuery({ text: "This command is disabled." });
      return;
    }
    return next();
  });

  // Generic callback dispatcher for .mjs commands that export `callbackHandler`
  bot.on("callback_query:data", createMjsCallbackDispatcher(projectCtx));

  // Wire handlers
  bot.on("message:text", createTextHandler(projectCtx, debounceActiveUsers));
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
    info: cmd.info.enabled,
    git: cmd.git.enabled,
    model: cmd.model.enabled,
    engine: cmd.engine.enabled,
    npm: cmd.npm.enabled,
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
  const commandsForMenu = commandsForTelegramMenu(commands);
  if (commandsForMenu.length > 0) {
    const tooLong = getCommandsWithDescriptionTooLong(
      commandsForMenu,
      config.configDir,
    );
    if (tooLong.length > 0) {
      const details = tooLong
        .map(
          (o) =>
            `  /${o.command}: description length ${o.length} (max 256) — ${o.path}`,
        )
        .join("\n");
      throw new Error(
        `Command description(s) exceed Telegram's 256-character limit:\n${details}`,
      );
    }
    await bot.api.setMyCommands(
      commandsForMenu.map((c) => ({
        command: c.command,
        description: c.description,
      })),
    );
    logger.info(
      { count: commandsForMenu.length },
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
    bot,
    stop: async () => {
      await watcher.stop();
      clearAllPrompts();
      rateLimitCleanup();
      await bot.stop(); // Stops polling; Grammy waits for in-flight updates to finish
      await runningPromise;
    },
  };
}
