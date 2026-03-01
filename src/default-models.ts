import type { EngineName } from "./engine/types.js";

/**
 * HAL-defined default models for engines that require an explicit model
 * when `engine.model` is omitted from config.
 *
 * Engines NOT listed here (Codex, Copilot, Cursor) use their own built-in
 * default when no model flag is passed.
 */
const DEFAULT_ENGINE_MODEL: Partial<Record<EngineName, string>> = {
  claude: "default",
  opencode: "opencode/gpt-5-nano",
  // TODO: Antigravity — add enty here once the engine adapter is implemented.
};

export function getDefaultEngineModel(engine: EngineName): string | undefined {
  return DEFAULT_ENGINE_MODEL[engine];
}
