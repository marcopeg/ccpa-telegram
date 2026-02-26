import { join } from "node:path";
import type { Bot } from "grammy";
import type pino from "pino";
import { loadCommands } from "./loader.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CommandWatcher {
  stop: () => Promise<void>;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Start a file watcher that monitors command directories and the skills dir,
 * then re-publishes the full merged command list to Telegram on any change.
 */
export function startCommandWatcher(
  bot: Bot,
  projectCwd: string,
  configDir: string,
  logger: pino.Logger,
  skillsDir?: string,
): CommandWatcher {
  const projectCommandDir = join(projectCwd, ".ccpa", "commands");
  const globalCommandDir = join(configDir, ".ccpa", "commands");

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function republish(): Promise<void> {
    try {
      const commands = await loadCommands(
        projectCwd,
        configDir,
        logger,
        skillsDir,
      );
      await bot.api.setMyCommands(
        commands.map((c) => ({
          command: c.command,
          description: c.description,
        })),
      );
      logger.info(
        {
          count: commands.length,
          commands: commands.map((c) => c.command),
        },
        "Commands re-registered with Telegram",
      );
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to re-register commands with Telegram",
      );
    }
  }

  function scheduleRepublish(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void republish();
    }, 300);
  }

  // Dynamically import chokidar to start watching
  // We do this in an async IIFE so we can use await
  let watcherInstance: { close: () => Promise<void> } | null = null;

  const watcherReady = (async () => {
    try {
      const chokidar = await import("chokidar");

      const watchPaths = [projectCommandDir, globalCommandDir];
      if (skillsDir) {
        watchPaths.push(skillsDir);
      }

      const watcher = chokidar.watch(watchPaths, {
        ignoreInitial: true,
        persistent: true,
        ignored: (path: string) => {
          const basename = path.split("/").pop() ?? "";
          // Allow directories (no extension), .mjs files, and SKILL.md files
          return (
            basename.includes(".") &&
            !basename.endsWith(".mjs") &&
            basename !== "SKILL.md"
          );
        },
      });

      function isRelevant(filePath: string): boolean {
        return filePath.endsWith(".mjs") || filePath.endsWith("SKILL.md");
      }

      watcher.on("add", (filePath: string) => {
        if (isRelevant(filePath)) {
          logger.debug({ filePath }, "Command/skill file added");
          scheduleRepublish();
        }
      });

      watcher.on("change", (filePath: string) => {
        if (isRelevant(filePath)) {
          logger.debug({ filePath }, "Command/skill file changed");
          scheduleRepublish();
        }
      });

      watcher.on("unlink", (filePath: string) => {
        if (isRelevant(filePath)) {
          logger.debug({ filePath }, "Command/skill file removed");
          scheduleRepublish();
        }
      });

      watcher.on("error", (err: unknown) => {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Command watcher error",
        );
      });

      watcherInstance = watcher;
      logger.debug(
        { projectCommandDir, globalCommandDir, skillsDir },
        "Command watcher started",
      );
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to start command watcher",
      );
    }
  })();

  return {
    stop: async () => {
      // Cancel any pending debounce
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      // Wait for watcher to be ready before closing
      await watcherReady;
      if (watcherInstance !== null) {
        await watcherInstance.close();
        watcherInstance = null;
        logger.debug("Command watcher stopped");
      }
    },
  };
}
