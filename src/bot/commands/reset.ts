import { join } from "node:path";
import type { Api, Context, NextFunction } from "grammy";
import { InlineKeyboard } from "grammy";
import type { ProjectContext } from "../../types.js";
import { clearUserData } from "../../user/setup.js";
import { invalidatePrompt, resolvePrompt, trackPrompt } from "./resetPrompt.js";
import { resetSession } from "./session.js";

const DEFAULT_CONFIRM =
  "This is going to delete the user data folder. Are you sure?";

const DEFAULT_DONE = "done!";

export function createResetHandler(ctx: ProjectContext, botApi: Api) {
  return async (gramCtx: Context): Promise<void> => {
    const userId = gramCtx.from?.id;
    const chatId = gramCtx.chat?.id;

    if (!userId || !chatId) {
      await gramCtx.reply("Could not identify user.");
      return;
    }

    try {
      // Invalidate any previous active prompt for this user
      await invalidatePrompt(userId, botApi);

      const keyboard = new InlineKeyboard()
        .text("Yes, go ahead!", `r:y:${userId}`)
        .text("Abort!", `r:n:${userId}`);

      const confirmText =
        ctx.config.commands.reset.message.confirm ?? DEFAULT_CONFIRM;

      const sent = await gramCtx.reply(confirmText, {
        reply_markup: keyboard,
      });

      trackPrompt(
        userId,
        chatId,
        sent.message_id,
        ctx.config.commands.reset.timeout * 1000,
        botApi,
      );
    } catch (_error) {
      await gramCtx.reply("Failed to initiate reset. Please try again.");
    }
  };
}

export function createResetCallbackHandler(ctx: ProjectContext) {
  return async (gramCtx: Context, next: NextFunction): Promise<void> => {
    const data = gramCtx.callbackQuery?.data;
    if (!data?.startsWith("r:")) {
      return next();
    }

    const { config, logger } = ctx;

    try {
      const parts = data.split(":");
      const action = parts[1];
      const targetUserId = Number(parts[2]);

      // Verify the tapping user matches the target
      if (gramCtx.from?.id !== targetUserId) {
        await gramCtx.answerCallbackQuery({
          text: "This action is not for you.",
        });
        return;
      }

      resolvePrompt(targetUserId);

      if (action === "y") {
        const userDir = join(config.dataDir, String(targetUserId));
        await clearUserData(userDir);

        // Reset session if configured
        if (config.commands.reset.sessionReset) {
          try {
            await resetSession(ctx, gramCtx, { silent: true });
          } catch (err) {
            logger.error(
              { error: err instanceof Error ? err.message : String(err) },
              "/reset session reset failed",
            );
          }
        }

        const doneText = config.commands.reset.message.done ?? DEFAULT_DONE;
        await gramCtx.editMessageText(doneText, {
          reply_markup: undefined,
        });
      } else {
        await gramCtx.editMessageText("Reset cancelled.", {
          reply_markup: undefined,
        });
      }

      await gramCtx.answerCallbackQuery();
    } catch (err) {
      logger.error(
        { data, error: err instanceof Error ? err.message : String(err) },
        "reset callback failed",
      );
      try {
        await gramCtx.answerCallbackQuery({ text: "Operation failed." });
      } catch {
        // ignore
      }
    }
  };
}
