import { join, resolve } from "node:path";
import type { Context } from "grammy";
import { executeClaudeQuery } from "../../claude/executor.js";
import { sendChunkedResponse } from "../../telegram/chunker.js";
import { sendDownloadFiles } from "../../telegram/fileSender.js";
import type { ProjectContext } from "../../types.js";
import {
  ensureUserSetup,
  getDownloadsPath,
  getSessionId,
  saveSessionId,
} from "../../user/setup.js";

/**
 * Returns a handler for text messages.
 */
export function createTextHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const userId = gramCtx.from?.id;
    const messageText = gramCtx.message?.text;

    if (!userId || !messageText) {
      return;
    }

    logger.debug(
      {
        userId,
        username: gramCtx.from?.username,
        name: gramCtx.from?.first_name,
      },
      "Message received",
    );

    const userDir = resolve(join(config.dataDir, String(userId)));

    try {
      await ensureUserSetup(userDir);

      if (!messageText.trim()) {
        await gramCtx.reply("Please provide a message.");
        return;
      }

      const sessionId = await getSessionId(userDir);
      logger.debug({ sessionId: sessionId || "new" }, "Session");

      const statusMsg = await gramCtx.reply("_Processing..._", {
        parse_mode: "Markdown",
      });
      let lastProgressUpdate = Date.now();
      let lastProgressText = "Processing...";

      const onProgress = async (message: string) => {
        const now = Date.now();
        if (now - lastProgressUpdate > 2000 && message !== lastProgressText) {
          lastProgressUpdate = now;
          lastProgressText = message;
          try {
            await gramCtx.api.editMessageText(
              gramCtx.chat!.id,
              statusMsg.message_id,
              `_${message}_`,
              { parse_mode: "Markdown" },
            );
          } catch {
            // Ignore edit errors
          }
        }
      };

      const downloadsPath = getDownloadsPath(userDir);

      logger.debug("Executing Claude query");
      const result = await executeClaudeQuery(
        {
          prompt: messageText,
          gramCtx,
          userDir,
          downloadsPath,
          sessionId,
          onProgress,
        },
        ctx,
      );
      logger.debug(
        { success: result.success, error: result.error },
        "Claude result",
      );

      try {
        await gramCtx.api.deleteMessage(gramCtx.chat!.id, statusMsg.message_id);
      } catch {
        // Ignore delete errors
      }

      if (result.sessionId) {
        await saveSessionId(userDir, result.sessionId);
        logger.debug({ sessionId: result.sessionId }, "Session saved");
      }

      const responseText = result.success
        ? result.output
        : result.error || "An error occurred";
      await sendChunkedResponse(gramCtx, responseText);

      const filesSent = await sendDownloadFiles(gramCtx, userDir, ctx);
      if (filesSent > 0) {
        logger.info({ filesSent }, "Sent download files to user");
      }
    } catch (error) {
      logger.error({ error }, "Text handler error");
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await gramCtx.reply(`An error occurred: ${errorMessage}`);
    }
  };
}
