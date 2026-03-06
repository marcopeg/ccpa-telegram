import type { ConfigFormat, SessionMode } from "../config.js";

export type { SessionMode };

/**
 * Loosely-typed raw config object (pre-Zod), read directly from the config
 * file without env-var substitution. Only covers fields the wizard cares about.
 */
export interface PartialConfig {
  providers?: unknown;
  env?: string;
  globals?: {
    access?: { allowedUserIds?: unknown[] };
    engine?: { name?: string; model?: string; session?: unknown };
  };
  projects?: Record<
    string,
    {
      name?: string;
      cwd?: string;
      telegram?: { botToken?: string };
      access?: { allowedUserIds?: unknown[] };
      engine?: { name?: string; model?: string; session?: unknown };
    }
  >;
}

export interface PrefillFlags {
  /** Project display name (wizard step 1). */
  name?: string;
  /** Project cwd (wizard step 2). */
  cwd?: string;
  engine?: string;
  model?: string;
  /** Telegram bot token to use for the project. */
  apiKey?: string;
  /** Back-compat alias for apiKey. */
  botKey?: string;
  userId?: string;
  session?: string;
}

export interface WizardContext {
  /** Config directory (where hal.config.* lives / will be written). */
  cwd: string;
  /** Parsed existing config, or null when creating from scratch. */
  existingConfig: PartialConfig | null;
  /** Absolute path to the existing config file, or null. */
  existingConfigPath: string | null;
  /** Format of the existing config file (drives write-back format). null = fresh → default YAML. */
  existingConfigFormat: ConfigFormat | null;
  /** CLI pre-fill flags. */
  prefill: PrefillFlags;
  /** When true, skip isConfigured checks and re-prompt all steps. */
  reset: boolean;
  /** Background engine discovery; started at wizard boot. */
  availableEnginesPromise?: Promise<string[]>;
  /** Accumulates outputs from each step. */
  results: {
    projectKey?: string;
    projectName?: string;
    cwd?: string;
    /** Engines enabled in config providers (for /engine switching). */
    enabledEngines?: string[];
    botToken?: string;
    userId?: number;
    additionalUserIds?: number[];
    /** Default engine (stored in globals.engine.*). */
    engine?: string;
    /** Default model for globals.engine.*. */
    model?: string;
    session?: SessionMode;
    /** Whether to store secrets inline in config or via .env placeholders. */
    secretsMode?: "env" | "inline";
    /** set by confirm-and-write */
    startBot?: boolean;
  };
}

export interface WizardStep {
  id: string;
  label: string;
  /** True when this step's value is already present in the config and --reset is false. */
  isConfigured(ctx: WizardContext): boolean;
  /** Additional skip logic beyond isConfigured (e.g. prefill provided). */
  shouldSkip?(ctx: WizardContext): boolean;
  /** Run the step, mutating ctx.results in place. */
  run(ctx: WizardContext): Promise<void>;
}
