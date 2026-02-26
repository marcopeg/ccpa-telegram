import { join } from "node:path";
import type { Context } from "grammy";
import type { ProjectContext } from "../../types.js";
import { clearUserData } from "../../user/setup.js";

/**
 * Returns a handler for the /clear command.
 */
export function createClearHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const userId = gramCtx.from?.id;

    if (!userId) {
      await gramCtx.reply("Could not identify user.");
      return;
    }

    const userDir = join(ctx.config.dataDir, String(userId));

    try {
      await clearUserData(userDir);
      await gramCtx.reply(
        "Conversation history cleared. Your next message will start a fresh conversation.",
      );
    } catch (_error) {
      await gramCtx.reply(
        "Failed to clear conversation history. Please try again.",
      );
    }
  };
}
