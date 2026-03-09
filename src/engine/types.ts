import type { Context as GrammyContext } from "grammy";
import type { ProjectContext } from "../types.js";

// ─── Engine name ────────────────────────────────────────────────────────────

export type EngineName =
  | "claude"
  | "copilot"
  | "codex"
  | "opencode"
  | "cursor"
  | "antigravity";

export const ENGINE_NAMES: readonly EngineName[] = [
  "claude",
  "copilot",
  "codex",
  "opencode",
  "cursor",
  "antigravity",
] as const;

// ─── Shared execute / result types ──────────────────────────────────────────

export interface EngineExecuteOptions {
  prompt: string;
  userDir: string;
  gramCtx?: GrammyContext;
  downloadsPath?: string;
  sessionId?: string | null;
  onProgress?: (message: string) => void;
  /** When false, do not continue previous session (e.g. for /clean renewal). */
  continueSession?: boolean;
  // When true, instruct the adapter to avoid any session-resume behaviour
  // for this single call (e.g. Copilot: do not pass --continue).
  forceNoSession?: boolean;
}

export interface EngineResult {
  success: boolean;
  output: string;
  sessionId?: string;
  error?: string;
}

export interface ParsedResponse {
  text: string;
  sessionId?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface EngineSessionCapabilities {
  /** True when adapter can resume by user-specific session identifier. */
  supportsUserIsolation: boolean;
  /** Effective mode used when config is engine.session=true. */
  defaultMode: "user" | "shared";
  /**
   * True when shared/cwd-scoped continuation needs a persisted marker
   * to decide whether to pass continuation flags on subsequent messages.
   */
  sharedContinuationRequiresMarker: boolean;
}

// ─── Adapter contract ───────────────────────────────────────────────────────

export interface EngineAdapter {
  /** Human-readable engine name for logs/errors */
  readonly name: string;
  /** CLI command to invoke (e.g. "claude", "copilot") */
  readonly command: string;
  /** Verify the CLI is installed and available; throw on failure */
  check(): void;
  /** Session behavior capabilities used by config/session policy. */
  readonly sessionCapabilities: EngineSessionCapabilities;
  /** Execute a prompt and return a normalised result */
  execute(
    options: EngineExecuteOptions,
    ctx: ProjectContext,
  ): Promise<EngineResult>;
  /** Parse raw result into user-facing response */
  parse(result: EngineResult): ParsedResponse;
  /** Return an ordered list of skill directories for a project (highest priority first) */
  skillsDirs(projectCwd: string): string[];
  /** Return the instructions filename for init scaffolding */
  instructionsFile(): string;
}
