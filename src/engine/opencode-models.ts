import { execSync } from "node:child_process";
import type { ProviderModel } from "../config.js";

/** Minimal config shape needed to resolve effective provider models for /model UI. */
export interface EffectiveModelsConfig {
  engine: string;
  providerModels: ProviderModel[];
  cwd: string;
  engineCommand?: string;
}

/**
 * Returns the model list to show in /model: from config, or from the engine CLI
 * when the engine supports self-discovery (opencode, cursor) and providers.* is not set.
 */
export function getEffectiveProviderModels(
  config: EffectiveModelsConfig,
): ProviderModel[] {
  if (config.providerModels.length > 0) return config.providerModels;
  if (config.engine === "opencode") {
    return getOpencodeModelsFromCli(
      config.cwd,
      config.engineCommand ?? "opencode",
    );
  }
  if (config.engine === "cursor") {
    return getCursorModelsFromCli(config.cwd, config.engineCommand ?? "agent");
  }
  return config.providerModels;
}

/**
 * Runs `opencode models` (or `${command} models`) in the given cwd and parses
 * stdout into a list of ProviderModel. Used when providers.opencode is not
 * set so the /model UI shows only models actually supported by the OpenCode CLI.
 *
 * Returns [] on any failure (command missing, non-zero exit, or unparseable output).
 */
export function getOpencodeModelsFromCli(
  cwd: string,
  command: string = "opencode",
): ProviderModel[] {
  try {
    const stdout = execSync(`${command} models`, {
      cwd,
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const models: ProviderModel[] = [];

    for (const line of lines) {
      // Skip header-like lines (all caps, "Available", "Model", "---", etc.)
      const lower = line.toLowerCase();
      if (
        lower.startsWith("available") ||
        lower === "models" ||
        /^[-=]+$/.test(line) ||
        /^model\s/i.test(line)
      ) {
        continue;
      }

      // Accept lines that look like provider/model (e.g. opencode/gpt-5-nano) or plain model ids
      if (/^[\w.-]+\/[\w.-]+$/.test(line) || /^[\w.-]+$/.test(line)) {
        models.push({ name: line, description: undefined, default: false });
      }
    }

    return models;
  } catch {
    return [];
  }
}

/**
 * Runs `agent models` (or `${command} models`) in the given cwd and parses
 * stdout into a list of ProviderModel. Used when providers.cursor is not set
 * so the /model UI shows only models actually supported by the Cursor Agent CLI.
 *
 * Returns [] on any failure (command missing, non-zero exit, or unparseable output).
 */
export function getCursorModelsFromCli(
  cwd: string,
  command: string = "agent",
): ProviderModel[] {
  try {
    const stdout = execSync(`${command} models`, {
      cwd,
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const lines = stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const models: ProviderModel[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (
        lower.startsWith("available") ||
        lower === "models" ||
        /^[-=]+$/.test(line) ||
        /^model\s/i.test(line)
      ) {
        continue;
      }

      // Cursor model ids: sonnet-4.6, opus-4.6, composer-1.5, auto, etc.
      if (/^[\w.-]+$/.test(line) && line.length > 0) {
        models.push({ name: line, description: undefined, default: false });
      }
    }

    return models;
  } catch {
    return [];
  }
}
