import { join } from "node:path";
import type { Context } from "grammy";
import { createAgent } from "../../agent/index.js";
import { sendChunkedResponse } from "../../telegram/chunker.js";
import type { ProjectContext } from "../../types.js";
import { clearSessionData } from "../../user/setup.js";

/**
 * Returns a handler for the /new and /clean commands.
 * Resets the session without wiping uploads/downloads.
 *
 * - Claude (and other engines): passive reset — delete session.json, static reply.
 * - Copilot, Codex: active reset — send sessionMsg without continue flag, reply with engine output.
 */
export function createSessionHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const userId = gramCtx.from?.id;

    if (!userId) {
      await gramCtx.reply("Could not identify user.");
      return;
    }

    const userDir = join(config.dataDir, String(userId));

    try {
      // Always clear local session state
      await clearSessionData(userDir);
      logger.info({ userId }, "Session data cleared");

      if (config.engine === "copilot" || config.engine === "codex") {
        // Active reset: send sessionMsg without --continue to force a new session
        const statusMsg = await gramCtx.reply("_Starting new session..._", {
          parse_mode: "Markdown",
        });

        try {
          const agent = createAgent(ctx);
          const result = await agent.call(config.engineSessionMsg, {
            continueSession: false,
          });

          try {
            await gramCtx.api.deleteMessage(
              gramCtx.chat!.id,
              statusMsg.message_id,
            );
          } catch {
            // Ignore delete errors
          }

          await sendChunkedResponse(gramCtx, result);
        } catch (err) {
          try {
            await gramCtx.api.deleteMessage(
              gramCtx.chat!.id,
              statusMsg.message_id,
            );
          } catch {
            // Ignore delete errors
          }

          logger.error(
            { error: err instanceof Error ? err.message : String(err) },
            "Session renewal engine call failed",
          );
          await gramCtx.reply("Failed to start new session. Please try again.");
        }
      } else {
        // Passive reset for Claude and other engines
        await gramCtx.reply("New session started.");
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Session renewal failed",
      );
      await gramCtx.reply("Failed to start new session. Please try again.");
    }
  };
}
