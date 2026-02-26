import { execSync } from "node:child_process";
import { Bot } from "grammy";
import { createClearHandler } from "./bot/commands/clear.js";
import { helpHandler } from "./bot/commands/help.js";
import { startHandler } from "./bot/commands/start.js";
import {
  createDocumentHandler,
  createPhotoHandler,
  createTextHandler,
  createVoiceHandler,
} from "./bot/handlers/index.js";
import { createAuthMiddleware } from "./bot/middleware/auth.js";
import { createRateLimitMiddleware } from "./bot/middleware/rateLimit.js";
import type { ProjectContext } from "./types.js";

/**
 * Check if the Claude CLI command is available, throwing on failure.
 */
function checkClaudeCommand(command: string): void {
  try {
    execSync(`${command} --version`, { stdio: "pipe" });
  } catch {
    throw new Error(
      `Claude CLI command "${command}" not found or not executable. ` +
        `Please ensure Claude Code is installed and the command is in your PATH. ` +
        `You can also set a custom command in ccpa.config.json under "claude.command".`,
    );
  }
}

export interface BotHandle {
  stop: () => Promise<void>;
}

/**
 * Start a single bot for one project context.
 * Resolves when the bot is fully running; rejects if startup fails.
 * Returns a handle with a stop() function for graceful shutdown.
 */
export async function startBot(projectCtx: ProjectContext): Promise<BotHandle> {
  const { config, logger } = projectCtx;

  logger.info({ cwd: config.cwd, dataDir: config.dataDir }, "Starting bot");

  // Verify Claude CLI is available (throws on failure)
  logger.debug({ command: config.claude.command }, "Checking Claude CLI");
  checkClaudeCommand(config.claude.command);
  logger.info({ command: config.claude.command }, "Claude CLI verified");

  const bot = new Bot(config.telegram.botToken);

  // Wire per-bot middleware
  const { middleware: rateLimitMw, cleanup: rateLimitCleanup } =
    createRateLimitMiddleware(projectCtx);
  bot.use(createAuthMiddleware(projectCtx));
  bot.use(rateLimitMw);

  // Wire commands
  bot.command("start", startHandler);
  bot.command("help", helpHandler);
  bot.command("clear", createClearHandler(projectCtx));

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

  return {
    stop: async () => {
      rateLimitCleanup();
      await bot.stop();
      await runningPromise;
    },
  };
}
