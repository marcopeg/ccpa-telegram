import type { Context, NextFunction } from "grammy";
import type { ProjectContext } from "../../types.js";
import { resolveCommandPath } from "../commands/loader.js";

/**
 * Generic callback query dispatcher for .mjs command files.
 *
 * When a callback_query data value is prefixed with a command name followed
 * by ":" (e.g. "tasks:drafts"), this handler looks up the corresponding
 * .hal/commands/{name}.mjs file and calls its `callbackHandler` export (if
 * present), passing { data, gram, projectCtx }.
 *
 * This lets any .mjs command handle its own inline keyboard callbacks without
 * requiring changes to bot.ts.
 */
export function createMjsCallbackDispatcher(ctx: ProjectContext) {
  return async (gramCtx: Context, next: NextFunction): Promise<void> => {
    const data = gramCtx.callbackQuery?.data;
    if (!data) return next();

    const colonIdx = data.indexOf(":");
    if (colonIdx === -1) return next();

    const commandName = data.slice(0, colonIdx);
    const filePath = resolveCommandPath(
      commandName,
      ctx.config.cwd,
      ctx.config.configDir,
    );
    if (!filePath) {
      ctx.logger.debug(
        { commandName, cwd: ctx.config.cwd, configDir: ctx.config.configDir },
        "MJS callback: no command file for prefix, passing through",
      );
      try {
        await gramCtx.answerCallbackQuery();
      } catch {
        // ignore
      }
      return next();
    }

    // From here on we've matched the command — answer the query on any failure
    // to prevent the Telegram button from staying in a pending/spinning state.
    let mod: Record<string, unknown>;
    try {
      mod = await import(`${filePath}?t=${Date.now()}`);
    } catch (err) {
      ctx.logger.error(
        {
          commandName,
          error: err instanceof Error ? err.message : String(err),
        },
        "MJS callback: failed to import command file",
      );
      try {
        await gramCtx.answerCallbackQuery({ text: "Command unavailable." });
      } catch {
        // ignore
      }
      return;
    }

    if (typeof mod.callbackHandler !== "function") {
      try {
        await gramCtx.answerCallbackQuery({ text: "No callback handler." });
      } catch {
        // ignore
      }
      return;
    }

    try {
      await (mod.callbackHandler as (opts: unknown) => Promise<void>)({
        data,
        gram: gramCtx,
        projectCtx: ctx,
      });
    } catch (err) {
      ctx.logger.error(
        {
          commandName,
          data,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
        "MJS callback handler failed",
      );
      try {
        await gramCtx.answerCallbackQuery({ text: "Operation failed." });
      } catch {
        // ignore
      }
    }
  };
}
