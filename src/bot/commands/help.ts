import type { Context } from "grammy";
import type { ProjectContext } from "../../types.js";
import { resolveCommandMessage } from "./message.js";

// biome-ignore lint/suspicious/noTemplateCurlyInString: HAL placeholder syntax, not JS template
const DEFAULT_TEMPLATE = "${HAL_COMMANDS}";

export function createHelpHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const helpCfg = ctx.config.commands.help;

    const template = helpCfg.message ?? DEFAULT_TEMPLATE;
    const message = await resolveCommandMessage(template, ctx, gramCtx);
    await gramCtx.reply(message, { parse_mode: "Markdown" });
  };
}
