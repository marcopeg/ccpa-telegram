import { join } from "node:path";
import type { Context } from "grammy";
import { createAgent } from "../../agent/index.js";
import { sendChunkedResponse } from "../../telegram/chunker.js";
import type { ProjectContext } from "../../types.js";
import { clearSessionData } from "../../user/setup.js";
import { resolveCommandMessage } from "./message.js";

const DEFAULT_CLEAN_TEMPLATE =
  "Session reset. Your next message starts a new conversation.";

/**
 * Shared session-reset logic used by /clean and /start (when configured).
 *
 * - Always clears local session state (session.json).
 * - For active-reset engines (copilot, codex, opencode, cursor): sends sessionMsg
 *   without continueSession to force a new engine session, replies with engine output.
 * - For passive engines (claude, etc.): static confirmation reply.
 *
 * When `silent` is true, no reply is sent to the user (caller handles messaging).
 */
export async function resetSession(
  ctx: ProjectContext,
  gramCtx: Context,
  options?: { silent?: boolean },
): Promise<void> {
  const { config, logger } = ctx;
  const userId = gramCtx.from?.id;

  if (!userId) {
    if (!options?.silent) await gramCtx.reply("Could not identify user.");
    return;
  }

  const userDir = join(config.dataDir, String(userId));

  await clearSessionData(userDir);
  logger.info({ userId }, "Session data cleared");

  if (
    config.engine === "copilot" ||
    config.engine === "codex" ||
    config.engine === "opencode" ||
    config.engine === "cursor"
  ) {
    const statusMsg = await gramCtx.reply("_Starting new session..._", {
      parse_mode: "Markdown",
    });

    try {
      const agent = createAgent(ctx);
      const result = await agent.call(config.engineSessionMsg, {
        continueSession: false,
      });

      try {
        await gramCtx.api.deleteMessage(gramCtx.chat!.id, statusMsg.message_id);
      } catch {
        // Ignore delete errors
      }

      if (!options?.silent) await sendChunkedResponse(gramCtx, result);
    } catch (err) {
      try {
        await gramCtx.api.deleteMessage(gramCtx.chat!.id, statusMsg.message_id);
      } catch {
        // Ignore delete errors
      }

      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Session renewal engine call failed",
      );
      if (!options?.silent)
        await gramCtx.reply("Failed to start new session. Please try again.");
    }
  } else if (!options?.silent) {
    await gramCtx.reply("New session started.");
  }
}

/**
 * Returns a handler for the /clean command.
 * Resets the session, then sends a customizable confirmation message.
 */
export function createCleanHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    try {
      await resetSession(ctx, gramCtx, { silent: true });

      const template =
        ctx.config.commands.clean?.message ?? DEFAULT_CLEAN_TEMPLATE;
      const message = await resolveCommandMessage(template, ctx, gramCtx);
      await gramCtx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      ctx.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Session renewal failed",
      );
      await gramCtx.reply("Failed to reset session. Please try again.");
    }
  };
}
