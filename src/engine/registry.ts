import { createClaudeAdapter } from "./adapters/claude.js";
import { createCodexAdapter } from "./adapters/codex.js";
import { createCopilotAdapter } from "./adapters/copilot.js";
import { createCursorAdapter } from "./adapters/cursor.js";
import { createOpencodeAdapter } from "./adapters/opencode.js";
import type { EngineAdapter, EngineName } from "./types.js";

type AdapterFactory = (command?: string, model?: string) => EngineAdapter;

const factories: Record<EngineName, AdapterFactory> = {
  claude: createClaudeAdapter,
  copilot: createCopilotAdapter,
  codex: createCodexAdapter,
  opencode: createOpencodeAdapter,
  cursor: createCursorAdapter,
};

/**
 * Create an engine adapter by name.
 * @param name - Engine identifier
 * @param command - Optional custom CLI command override
 * @param model - Optional model override (omit to use engine default)
 */
export function getEngine(
  name: EngineName,
  command?: string,
  model?: string,
): EngineAdapter {
  const factory = factories[name];
  if (!factory) {
    throw new Error(
      `Unknown engine "${name}". Supported: ${Object.keys(factories).join(", ")}`,
    );
  }
  return factory(command, model);
}
