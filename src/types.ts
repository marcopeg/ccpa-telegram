import type pino from "pino";
import type { ResolvedProjectConfig } from "./config.js";
import type { BootContext } from "./context/resolver.js";
import type { EngineAdapter } from "./engine/types.js";

/**
 * Engine-agnostic interface for making one-shot AI calls from command handlers.
 * The underlying provider (Claude Code, Copilot, etc.) is an implementation detail.
 */
export interface Agent {
  call(
    prompt: string,
    options?: {
      onProgress?: (message: string) => void;
      /** When false, do not continue previous session (e.g. session renewal). */
      continueSession?: boolean;
    },
  ): Promise<string>;
}

/**
 * Per-project context object threaded through all bot internals.
 * Replaces the former global singletons (getConfig / getLogger).
 */
export interface ProjectContext {
  config: ResolvedProjectConfig;
  logger: pino.Logger;
  bootContext: BootContext;
  engine: EngineAdapter;
}
