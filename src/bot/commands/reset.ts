import { join } from "node:path";
import type { Context } from "grammy";
import type { ProjectContext } from "../../types.js";
import { clearUserData } from "../../user/setup.js";
import { resolveCommandMessage } from "./message.js";

const DEFAULT_TEMPLATE =
  "All user data wiped and session reset. Your next message starts fresh.";

export function createResetHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const userId = gramCtx.from?.id;

    if (!userId) {
      await gramCtx.reply("Could not identify user.");
      return;
    }

    const userDir = join(ctx.config.dataDir, String(userId));

    try {
      await clearUserData(userDir);

      const template = ctx.config.commands.reset?.message ?? DEFAULT_TEMPLATE;
      const message = await resolveCommandMessage(template, ctx, gramCtx);
      await gramCtx.reply(message, { parse_mode: "Markdown" });
    } catch (_error) {
      await gramCtx.reply("Failed to reset. Please try again.");
    }
  };
}
