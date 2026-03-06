import { readFileSync } from "node:fs";
import { parseConfigContent, resolveConfigFile } from "../config.js";
import { runConfirmAndWrite } from "./confirm-and-write.js";
import { discoverAvailableEngines } from "./engine-discovery.js";
import { runWizard } from "./runner.js";
import steps from "./steps/index.js";
import type { PartialConfig, PrefillFlags, WizardContext } from "./types.js";

export type { PrefillFlags };

function supportsAnsiColor(
  out: NodeJS.WriteStream = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!out.isTTY) return false;
  if ("NO_COLOR" in env) return false;
  if ((env.TERM ?? "").toLowerCase() === "dumb") return false;
  return true;
}

function renderHalBanner(useColor: boolean): string {
  const subtitle = "MULTI-ENGINE TELEGRAM COMMAND DECK FOR AI CODING AGENTS";
  const frame =
    "================================================================";
  const accentStart = useColor ? "\u001b[31;1m" : "";
  const accentEnd = useColor ? "\u001b[0m" : "";
  return [
    frame,
    "",
    " _   _      _      _     ",
    "| | | |    / \\    | |    ",
    "| |_| |   / _ \\   | |    ",
    "|  _  |  / ___ \\  | |___ ",
    "|_| |_| /_/   \\_\\ |_____|",
    "",
    `${accentStart}${subtitle}${accentEnd}`,
    "",
    frame,
  ].join("\n");
}

function printWizardBanner(out: NodeJS.WriteStream = process.stdout): void {
  const banner = renderHalBanner(supportsAnsiColor(out));
  out.write(`${banner}\n\n`);
}

/**
 * Main entry point for the interactive setup wizard.
 *
 * @param cwd      Config directory (where hal.config.* lives or will be created).
 * @param prefill  Pre-fill values from CLI flags; their steps are skipped.
 * @param reset    When true, re-ask all questions even if values already exist.
 * @returns        true when the wizard completes and requests bot start; false otherwise.
 */
export async function startWizard(
  cwd: string,
  prefill: PrefillFlags,
  reset: boolean,
): Promise<boolean> {
  printWizardBanner();

  let existingConfig: PartialConfig | null = null;
  let existingConfigPath: string | null = null;
  let existingConfigFormat: import("../config.js").ConfigFormat | null = null;

  const resolved = resolveConfigFile(cwd, "hal.config");
  if (resolved) {
    existingConfigPath = resolved.path;
    existingConfigFormat = resolved.format;
    try {
      const raw = readFileSync(resolved.path, "utf-8");
      existingConfig = parseConfigContent(
        raw,
        resolved.format,
        resolved.path,
      ) as PartialConfig;
    } catch {
      existingConfig = null;
    }
  }

  const ctx: WizardContext = {
    cwd,
    existingConfig,
    existingConfigPath,
    existingConfigFormat,
    prefill,
    reset,
    availableEnginesPromise: discoverAvailableEngines(),
    results: {},
  };

  await runWizard(ctx, steps);
  await runConfirmAndWrite(ctx);

  // confirm-and-write stores startBot = true when user chooses to start
  return (ctx.results as Record<string, unknown>).startBot === true;
}
