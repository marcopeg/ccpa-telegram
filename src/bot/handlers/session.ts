import type { SessionMode } from "../../config.js";
import type { EngineAdapter } from "../../engine/types.js";

function resolveEffectiveMode(
  mode: SessionMode,
  engine: EngineAdapter,
): "user" | "shared" | false {
  if (mode === false) return false;
  if (mode === true) return engine.sessionCapabilities.defaultMode;
  return mode;
}

/**
 * Determines whether handlers should load session state from userDir.
 * This includes real user session IDs and shared continuation markers.
 */
export function shouldLoadSessionFromUserDir(
  mode: SessionMode,
  engine: EngineAdapter,
): boolean {
  const effectiveMode = resolveEffectiveMode(mode, engine);

  if (effectiveMode === false) return false;
  if (effectiveMode === "user") return true;

  return engine.sessionCapabilities.sharedContinuationRequiresMarker;
}
