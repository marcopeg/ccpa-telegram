import { exec } from "node:child_process";
import { unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import type { Context } from "grammy";
import { executeClaudeQuery } from "../../claude/executor.js";
import { parseClaudeOutput } from "../../claude/parser.js";
import { sendChunkedResponse } from "../../telegram/chunker.js";
import { sendDownloadFiles } from "../../telegram/fileSender.js";
import { transcribeAudio } from "../../transcription/whisper.js";
import type { ProjectContext } from "../../types.js";
import {
  ensureUserSetup,
  getDownloadsPath,
  getSessionId,
  getUploadsPath,
  saveSessionId,
} from "../../user/setup.js";

const execAsync = promisify(exec);

/**
 * Convert OGA/OGG (Opus) to WAV for Whisper compatibility
 */
async function convertToWav(
  inputPath: string,
  outputPath: string,
  ctx: ProjectContext,
): Promise<void> {
  const { logger } = ctx;
  try {
    await execAsync(
      `ffmpeg -i "${inputPath}" -ar 16000 -ac 1 -y "${outputPath}"`,
    );
    logger.debug({ inputPath, outputPath }, "Audio converted to WAV");
  } catch (error) {
    logger.error({ error }, "ffmpeg conversion failed");
    throw new Error(
      "Failed to convert audio. Ensure ffmpeg is installed: brew install ffmpeg",
    );
  }
}

/**
 * Returns a handler for voice messages (transcribe + route to Claude).
 */
export function createVoiceHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;

    if (!config.transcription) {
      await gramCtx.reply(
        "Voice messages are not configured for this bot. Add a 'transcription' section to your project config.",
      );
      return;
    }

    const userId = gramCtx.from?.id;
    const voice = gramCtx.message?.voice;

    if (!userId || !voice) {
      return;
    }

    logger.debug(
      { userId, duration: voice.duration, fileSize: voice.file_size },
      "Voice message received",
    );

    const userDir = resolve(join(config.dataDir, String(userId)));

    try {
      await ensureUserSetup(userDir);

      // Download voice file from Telegram
      const file = await gramCtx.api.getFile(voice.file_id);
      const filePath = file.file_path;

      if (!filePath) {
        await gramCtx.reply("Could not download the voice message.");
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${filePath}`;
      const response = await fetch(fileUrl);
      const buffer = Buffer.from(await response.arrayBuffer());

      const timestamp = Date.now();
      const uploadsDir = getUploadsPath(userDir);
      const ogaPath = join(uploadsDir, `voice_${timestamp}.oga`);
      const wavPath = join(uploadsDir, `voice_${timestamp}.wav`);
      await writeFile(ogaPath, buffer);

      logger.debug({ path: ogaPath }, "Voice file saved");

      const statusMsg = await gramCtx.reply("_Transcribing voice message..._", {
        parse_mode: "Markdown",
      });

      // Convert to WAV (Whisper requires WAV/MP3 input)
      await convertToWav(ogaPath, wavPath, ctx);

      // Transcribe with local Whisper
      const transcription = await transcribeAudio(wavPath, ctx);

      if (!transcription.text) {
        await gramCtx.api.deleteMessage(gramCtx.chat!.id, statusMsg.message_id);
        await gramCtx.reply(
          "Could not transcribe the voice message. Please try again.",
        );
        return;
      }

      // Optionally show transcription to user
      if (config.transcription.showTranscription) {
        try {
          await gramCtx.api.editMessageText(
            gramCtx.chat!.id,
            statusMsg.message_id,
            `_Transcribed: "${transcription.text}"_\n\n_Processing with Claude..._`,
            { parse_mode: "Markdown" },
          );
        } catch {
          // Ignore edit errors
        }
      } else {
        try {
          await gramCtx.api.editMessageText(
            gramCtx.chat!.id,
            statusMsg.message_id,
            "_Processing..._",
            { parse_mode: "Markdown" },
          );
        } catch {
          // Ignore edit errors
        }
      }

      // Clean up temporary files
      try {
        await unlink(ogaPath);
        await unlink(wavPath);
      } catch {
        // Ignore cleanup errors
      }

      const sessionId = await getSessionId(userDir);
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

      logger.debug(
        { transcription: transcription.text },
        "Executing Claude query",
      );
      const result = await executeClaudeQuery(
        {
          prompt: transcription.text,
          userDir,
          downloadsPath,
          sessionId,
          onProgress,
        },
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
      logger.error({ error }, "Voice handler error");
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await gramCtx.reply(
        `An error occurred processing the voice message: ${errorMessage}`,
      );
    }
  };
}
