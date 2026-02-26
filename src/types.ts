import type pino from "pino";
import type { ResolvedProjectConfig } from "./config.js";
import type { BootContext } from "./context/resolver.js";

/**
 * Per-project context object threaded through all bot internals.
 * Replaces the former global singletons (getConfig / getLogger).
 */
export interface ProjectContext {
  config: ResolvedProjectConfig;
  logger: pino.Logger;
  bootContext: BootContext;
}
