import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { updateProjectModel } from "../../config-writer.js";
import type { ProjectContext } from "../../types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createModelHandler(
  projectCtx: ProjectContext,
): (ctx: Context) => Promise<void> {
  return async (gramCtx: Context) => {
    const { config, logger } = projectCtx;
    const models = config.providerModels;

    const messageText = gramCtx.message?.text ?? "";
    const directMatch = messageText.match(/^\/model(?:@\w+)?\s+(.+)$/i);
    const directModel = directMatch?.[1]?.trim();

    if (directModel) {
      if (models.length > 0) {
        const valid = models.some((m) => m.name === directModel);
        if (!valid) {
          const available = models
            .map((m) => `• <code>${escapeHtml(m.name)}</code>`)
            .join("\n");
          await gramCtx.reply(
            `Model <b>${escapeHtml(directModel)}</b> is not in the configured models list.\n\nAvailable models:\n${available}`,
            { parse_mode: "HTML" },
          );
          return;
        }
      }

      try {
        updateProjectModel(
          config.configDir,
          config.slug,
          config.engine,
          directModel,
        );
        logger.info(
          { engine: config.engine, model: directModel },
          "Model switched via direct /model argument",
        );
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Failed to write model config",
        );
        await gramCtx.reply("Failed to update model in config.");
        return;
      }

      await gramCtx.reply(
        `✅ Model set to <b>${escapeHtml(directModel)}</b>\n\nThe change will take effect shortly.`,
        { parse_mode: "HTML" },
      );
      return;
    }

    // No argument provided
    const currentModel = config.engineModel;
    const defaultModel = config.providerDefaultModel;

    if (models.length === 0) {
      const lines: string[] = [];
      lines.push(`<b>Switch Model</b>`);
      lines.push(`Engine: <b>${escapeHtml(config.engine)}</b>`);
      if (currentModel) {
        lines.push(`Current: <b>${escapeHtml(currentModel)}</b>`);
      }
      lines.push("");
      lines.push(
        `No models list configured. Use <code>/model {name}</code> to set any model directly.`,
      );
      await gramCtx.reply(lines.join("\n"), { parse_mode: "HTML" });
      return;
    }

    const lines: string[] = [];
    lines.push(`<b>Switch Model</b>`);
    lines.push(`Engine: <b>${escapeHtml(config.engine)}</b>`);
    if (currentModel) {
      lines.push(`Current: <b>${escapeHtml(currentModel)}</b>`);
    }
    if (defaultModel && defaultModel !== currentModel) {
      lines.push(`Default: ${escapeHtml(defaultModel)}`);
    }
    lines.push("");

    for (const model of models) {
      const isCurrent = model.name === currentModel;
      const isDefault = model.default === true;
      const marker = isCurrent ? "▸ " : "   ";
      let line = `${marker}<b>${escapeHtml(model.name)}</b>`;
      if (model.description) {
        line += ` — ${escapeHtml(model.description)}`;
      }
      if (isDefault) {
        line += " ★";
      }
      lines.push(line);
    }

    lines.push("");
    lines.push(`<i>Tip: use /model &lt;name&gt; to set a model directly.</i>`);

    const keyboard = new InlineKeyboard();
    for (const model of models) {
      const isCurrent = model.name === currentModel;
      const isDefault = model.default === true;
      let label = model.name;
      if (isCurrent) label = `✓ ${label}`;
      if (isDefault) label = `${label} ★`;
      keyboard.text(label, `md:select:${model.name}`).row();
    }

    await gramCtx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  };
}
