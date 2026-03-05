import type { Context, NextFunction } from "grammy";
import { updateProjectModel } from "../../config-writer.js";
import { getEffectiveProviderModels } from "../../engine/opencode-models.js";
import type { ProjectContext } from "../../types.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createModelCallbackHandler(
  projectCtx: ProjectContext,
): (ctx: Context, next: NextFunction) => Promise<void> {
  return async (gramCtx: Context, next: NextFunction) => {
    const data = gramCtx.callbackQuery?.data;
    if (!data?.startsWith("md:")) {
      return next();
    }

    const { config, logger } = projectCtx;

    const parts = data.split(":");
    if (parts[1] !== "select" || !parts[2]) {
      await gramCtx.answerCallbackQuery("Invalid selection");
      return;
    }
    const modelId = parts.slice(2).join(":");

    const models = getEffectiveProviderModels(config);
    if (models.length > 0 && !models.some((m) => m.name === modelId)) {
      await gramCtx.answerCallbackQuery("Model no longer available");
      return;
    }

    try {
      updateProjectModel(config.configDir, config.slug, config.engine, modelId);
      logger.info({ engine: config.engine, model: modelId }, "Model switched");
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Failed to write model config",
      );
      await gramCtx.answerCallbackQuery("Failed to update config");
      return;
    }

    await gramCtx.answerCallbackQuery(`Model switched to ${modelId}`);
    await gramCtx.editMessageText(
      `✅ Model switched to <b>${escapeHtml(modelId)}</b>\n\nThe change will take effect shortly.`,
      { parse_mode: "HTML" },
    );
  };
}
