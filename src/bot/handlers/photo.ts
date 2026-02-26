import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Context } from "grammy";
import { executeClaudeQuery } from "../../claude/executor.js";
import { parseClaudeOutput } from "../../claude/parser.js";
import { sendChunkedResponse } from "../../telegram/chunker.js";
import { sendDownloadFiles } from "../../telegram/fileSender.js";
import type { ProjectContext } from "../../types.js";
import {
  ensureUserSetup,
  getDownloadsPath,
  getSessionId,
  getUploadsPath,
  saveSessionId,
} from "../../user/setup.js";

/**
 * Returns a handler for photo messages.
 */
export function createPhotoHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const userId = gramCtx.from?.id;
    const photo = gramCtx.message?.photo;
    const caption = gramCtx.message?.caption || "Please analyze this image.";

    if (!userId || !photo || photo.length === 0) {
      return;
    }

    logger.debug({ userId }, "Photo received");

    const userDir = resolve(join(config.dataDir, String(userId)));

    try {
      await ensureUserSetup(userDir);

      // Get the largest photo (last in array)
      const largestPhoto = photo[photo.length - 1];
      const file = await gramCtx.api.getFile(largestPhoto.file_id);
      const filePath = file.file_path;

      if (!filePath) {
        await gramCtx.reply("Could not download the image.");
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      const ext = filePath.split(".").pop() || "jpg";
      const imageName = `image_${Date.now()}.${ext}`;
      const uploadsDir = getUploadsPath(userDir);
      const imagePath = join(uploadsDir, imageName);
      await writeFile(imagePath, buffer);

      logger.debug({ path: imagePath }, "Image saved");

      const prompt = `Please look at the image file "./uploads/${imageName}" and ${caption}`;
      const sessionId = await getSessionId(userDir);

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

      logger.debug("Executing Claude query with image");
      const result = await executeClaudeQuery(
        { prompt, userDir, downloadsPath, sessionId, onProgress },
        ctx,
      );

      try {
        await gramCtx.api.deleteMessage(gramCtx.chat!.id, statusMsg.message_id);
      } catch {
        // Ignore delete errors
      }

      const parsed = parseClaudeOutput(result);

      if (parsed.sessionId) {
        await saveSessionId(userDir, parsed.sessionId);
      }

      await sendChunkedResponse(gramCtx, parsed.text);

      const filesSent = await sendDownloadFiles(gramCtx, userDir, ctx);
      if (filesSent > 0) {
        logger.info({ filesSent }, "Sent download files to user");
      }
    } catch (error) {
      logger.error({ error }, "Photo handler error");
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await gramCtx.reply(
        `An error occurred processing the image: ${errorMessage}`,
      );
    }
  };
}
