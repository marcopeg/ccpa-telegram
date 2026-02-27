import type { Context } from "grammy";
import type { ProjectContext } from "../../types.js";
import { resolveCommandMessage } from "./message.js";
import { resetSession } from "./session.js";

// biome-ignore lint/suspicious/noTemplateCurlyInString: HAL placeholder syntax, not JS template
const DEFAULT_TEMPLATE = "Welcome to ${project.name}!\n\n${HAL_COMMANDS}";

export function createStartHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const startCfg = config.commands.start;

    const template = startCfg?.message ?? DEFAULT_TEMPLATE;
    const message = await resolveCommandMessage(template, ctx, gramCtx);
    await gramCtx.reply(message, { parse_mode: "Markdown" });

    if (startCfg?.sessionReset) {
      try {
        await resetSession(ctx, gramCtx, { silent: true });
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "/start session reset failed",
        );
      }
    }
  };
}
