import { join, resolve } from "node:path";
import type { Context } from "grammy";
import { createAgent, getSkillsDirs } from "../../agent/index.js";
import { resolveContext } from "../../context/resolver.js";
import { getDefaultEngineModel } from "../../default-models.js";
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
import { shouldLoadSessionFromUserDir } from "./session.js";

/**
 * Returns a handler for text messages.
 */
export function createTextHandler(
  ctx: ProjectContext,
  debounceActiveUsers: Set<number>,
) {
  const { config, logger } = ctx;
  const windowMs = config.debounce.windowMs;

  interface BufferEntry {
    parts: Array<{ text: string; messageId: number }>;
    timer: ReturnType<typeof setTimeout>;
    gramCtx: Context;
    statusMsgId: number;
  }
  const buffers = new Map<number, BufferEntry>();

  async function dispatchMessage(
    gramCtx: Context,
    text: string,
    existingStatusMsgId?: number,
  ): Promise<void> {
    const userId = gramCtx.from?.id;
    if (!userId) return;

    const userDir = resolve(join(config.dataDir, String(userId)));

    await ensureUserSetup(userDir);

    if (!text.trim()) {
      await gramCtx.reply("Please provide a message.");
      return;
    }

    const shouldLoadSession = shouldLoadSessionFromUserDir(
      config.engineSession,
      ctx.engine,
    );
    const sessionId = shouldLoadSession ? await getSessionId(userDir) : null;
    logger.debug({ sessionId: sessionId || "new" }, "Session");

    let statusMsgId: number;
    if (existingStatusMsgId !== undefined) {
      statusMsgId = existingStatusMsgId;
      try {
        await gramCtx.api.editMessageText(
          gramCtx.chat!.id,
          statusMsgId,
          "_Processing..._",
          { parse_mode: "Markdown" },
        );
      } catch {
        // Ignore edit errors
      }
    } else {
      const statusMsg = await gramCtx.reply("_Processing..._", {
        parse_mode: "Markdown",
      });
      statusMsgId = statusMsg.message_id;
    }

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
            statusMsgId,
            `_${message}_`,
            { parse_mode: "Markdown" },
          );
        } catch {
          // Ignore edit errors
        }
      }
    };

    const downloadsPath = getDownloadsPath(userDir);

    logger.info("Executing engine query");
    const result = await ctx.engine.execute(
      {
        prompt: text,
        gramCtx,
        userDir,
        downloadsPath,
        sessionId,
        onProgress,
      },
      ctx,
    );
    logger.info(
      {
        success: result.success,
        error: result.error,
        response: result.output?.slice(0, 200),
      },
      "Engine result",
    );

    try {
      await gramCtx.api.deleteMessage(gramCtx.chat!.id, statusMsgId);
    } catch {
      // Ignore delete errors
    }

    if (config.engineSession !== false && result.sessionId) {
      await saveSessionId(userDir, result.sessionId);
      logger.debug({ sessionId: result.sessionId }, "Session saved");
    }

    const parsed = ctx.engine.parse(result);
    await sendChunkedResponse(gramCtx, parsed.text);

    const filesSent = await sendDownloadFiles(gramCtx, userDir, ctx);
    if (filesSent > 0) {
      logger.info({ filesSent }, "Sent download files to user");
    }
  }

  function flush(userId: number): void {
    const buf = buffers.get(userId);
    if (!buf) return;
    buffers.delete(userId);
    debounceActiveUsers.delete(userId);
    const sorted = [...buf.parts].sort((a, b) => a.messageId - b.messageId);
    const combined = sorted.map((p) => p.text).join("");
    dispatchMessage(buf.gramCtx, combined, buf.statusMsgId).catch((err) => {
      logger.error({ err }, "Debounce flush error");
    });
  }

  return async (gramCtx: Context): Promise<void> => {
    const userId = gramCtx.from?.id;
    const messageText = gramCtx.message?.text;
    const messageId = gramCtx.message?.message_id;

    if (!userId || !messageText) {
      return;
    }

    logger.info(
      {
        userId,
        username: gramCtx.from?.username,
        name: gramCtx.from?.first_name,
        message: messageText,
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
              engineName: config.engine,
              engineCommand: ctx.engine.command,
              engineModel: config.engineModel,
              engineDefaultModel: config.engineModel
                ? undefined
                : (getDefaultEngineModel(config.engine) ?? "engine-defaults"),
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
          getSkillsDirs(config.cwd, ctx),
          logger,
        );

        if (skillEntry?.skillPrompt && skillEntry.telegram) {
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

    const existing = buffers.get(userId);

    if (messageText.length >= 4096 || existing) {
      if (!existing) {
        // First part of a Telegram split — start buffering
        const statusMsg = await gramCtx.reply("_Buffering..._", {
          parse_mode: "Markdown",
        });
        debounceActiveUsers.add(userId);
        buffers.set(userId, {
          parts: [{ text: messageText, messageId: messageId ?? 0 }],
          timer: setTimeout(() => flush(userId), windowMs),
          gramCtx,
          statusMsgId: statusMsg.message_id,
        });
      } else {
        // Subsequent part — reset timer
        clearTimeout(existing.timer);
        existing.parts.push({ text: messageText, messageId: messageId ?? 0 });
        existing.gramCtx = gramCtx;
        existing.timer = setTimeout(() => flush(userId), windowMs);
      }
      return;
    }

    // Normal message (< 4096 chars, no active buffer) — dispatch immediately
    try {
      await dispatchMessage(gramCtx, messageText);
    } catch (error) {
      logger.error({ error }, "Text handler error");
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await gramCtx.reply(`An error occurred: ${errorMessage}`);
    }
  };
}
