import { join, resolve } from "node:path";
import type { Context } from "grammy";
import { createAgent, getSkillsDir } from "../../agent/index.js";
import { resolveContext } from "../../context/resolver.js";
import { sendChunkedResponse } from "../../telegram/chunker.js";
import { sendDownloadFiles } from "../../telegram/fileSender.js";
import type { ProjectContext } from "../../types.js";
import {
  ensureUserSetup,
  getDownloadsPath,
  getSessionId,
  saveSessionId,
} from "../../user/setup.js";
import { resolveCommandPath, resolveSkillEntry } from "../commands/loader.js";

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

    // ── Slash command interception ────────────────────────────────────────────
    if (messageText.startsWith("/")) {
      // Parse command name: /deploy staging → "deploy", strip @botname suffix
      const firstToken = messageText.slice(1).split(/\s+/)[0] ?? "";
      const commandName = firstToken.split("@")[0];
      const argsText = messageText.slice(1 + firstToken.length).trim();
      const args = argsText ? argsText.split(/\s+/) : [];

      if (commandName) {
        const filePath = resolveCommandPath(
          commandName,
          config.cwd,
          config.configDir,
        );

        if (filePath !== null) {
          try {
            const context = await resolveContext({
              gramCtx,
              configContext: config.context,
              bootContext: ctx.bootContext,
              configDir: config.configDir,
              projectCwd: config.cwd,
              projectName: config.name,
              projectSlug: config.slug,
              logger,
            });
            const agent = createAgent(ctx);
            // Cache-bust on every dispatch call
            const mod = await import(`${filePath}?t=${Date.now()}`);
            const result = await mod.default({
              args,
              ctx: context,
              gram: gramCtx,
              agent,
              projectCtx: ctx,
            });
            if (typeof result === "string") {
              await sendChunkedResponse(gramCtx, result);
            }
          } catch (err) {
            logger.error(
              {
                commandName,
                filePath,
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
              },
              "Command execution failed",
            );
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            await gramCtx.reply(`Command failed: ${errorMessage}`);
          }
          return;
        }

        // No .mjs handler — check if this is a registered skill
        const skillEntry = await resolveSkillEntry(
          commandName,
          getSkillsDir(config.cwd, ctx),
          logger,
        );

        if (skillEntry?.skillPrompt) {
          const prompt =
            args.length > 0
              ? `${skillEntry.skillPrompt}\n\nUser input: ${args.join(" ")}`
              : skillEntry.skillPrompt;

          const agent = createAgent(ctx);
          const statusMsg = await gramCtx.reply("_Processing..._", {
            parse_mode: "Markdown",
          });
          let lastProgressUpdate = Date.now();

          try {
            const result = await agent.call(prompt, {
              onProgress: async (message: string) => {
                const now = Date.now();
                if (now - lastProgressUpdate > 2000) {
                  lastProgressUpdate = now;
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
              },
            });
            await gramCtx.api.deleteMessage(
              gramCtx.chat!.id,
              statusMsg.message_id,
            );
            await sendChunkedResponse(gramCtx, result);
          } catch (err) {
            logger.error(
              {
                commandName,
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
              },
              "Skill execution failed",
            );
            try {
              await gramCtx.api.deleteMessage(
                gramCtx.chat!.id,
                statusMsg.message_id,
              );
            } catch {
              // Ignore delete errors
            }
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            await gramCtx.reply(`Skill failed: ${errorMessage}`);
          }
          return;
        }
        // Not a .mjs command or skill — fall through to Claude
      }
    }
    // ── End slash command interception ────────────────────────────────────────

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

      logger.debug("Executing engine query");
      const result = await ctx.engine.execute(
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
        "Engine result",
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
