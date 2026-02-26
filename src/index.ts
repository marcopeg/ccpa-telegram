// Re-exports for programmatic use

export type { BotHandle } from "./bot.js";
export { startBot } from "./bot.js";
export type { ResolvedProjectConfig } from "./config.js";
export {
  deriveSlug,
  loadMultiConfig,
  resolveProjectConfig,
  validateProjects,
} from "./config.js";
export { createProjectLogger, createStartupLogger } from "./logger.js";
export type { ProjectContext } from "./types.js";
