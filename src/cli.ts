#!/usr/bin/env node

import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isCancel, outro, select } from "@clack/prompts";
import type pino from "pino";
import { type BotHandle, startBot } from "./bot.js";
import type { LoadedConfigResult } from "./config.js";
import {
  resolveCustomEnvPaths,
  resolveProjectConfig,
  tryLoadMultiConfig,
  validateAccessPolicies,
  validateEngineEnvFiles,
  validateProjects,
  validateProviderDefaultUniqueness,
} from "./config.js";
import { startConfigWatcher } from "./config-watcher.js";
import { evaluateBootTimeShells } from "./context/resolver.js";
import { getDefaultEngineModel } from "./default-models.js";
import { getAvailableEnginesFromCli } from "./engine/cli-available.js";
import { getEngine } from "./engine/index.js";
import type { EngineName } from "./engine/types.js";
import { createProjectLogger, createStartupLogger } from "./logger.js";
import type { ProjectContext } from "./types.js";

/** One default model per engine for the chosen project engine. */
const DEFAULT_PROVIDER_MODEL: Record<EngineName, string> = {
  claude: "sonnet",
  copilot: "gpt-5-mini",
  codex: "gpt-5.2-codex",
  opencode: "opencode/gpt-5-nano",
  cursor: "auto",
  antigravity: "gemini-2.0-flash",
};

function getDefaultProviderModel(
  engine: EngineName,
  override?: string,
): string {
  return override ?? DEFAULT_PROVIDER_MODEL[engine];
}

const INIT_TEMPLATE_PATH = new URL("./init-template.yaml", import.meta.url);

/** Build YAML config from the template file with placeholder substitution. */
function buildYamlInitConfig(
  engineName: EngineName,
  projectCwd: string,
  modelOverride?: string,
): string {
  const model = getDefaultProviderModel(engineName, modelOverride);
  let template = readFileSync(INIT_TEMPLATE_PATH, "utf-8");
  // OpenCode: no hardcoded default; omit engine.model so the CLI uses its own default
  if (engineName === "opencode" && modelOverride === undefined) {
    template = template.replace(/\n\s+model: \{\{ENGINE_MODEL\}\}\n/, "\n");
  }
  return template
    .replace(/\{\{ENGINE_NAME\}\}/g, engineName)
    .replace(/\{\{ENGINE_MODEL\}\}/g, model)
    .replace(/\{\{PROJECT_CWD\}\}/g, JSON.stringify(projectCwd));
}

/** Prompt Y/n; Enter or empty = yes. Reads exactly one line then closes stdin. */
function promptYesNo(promptText: string): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    if (!process.stdin.readable || !process.stdin.isTTY) {
      resolve(true);
      return;
    }
    process.stdin.setEncoding("utf-8");
    process.stdin.resume();
    let buf = "";
    const onData = (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        process.stdin.removeListener("data", onData);
        process.stdin.pause();
        const line = buf.slice(0, nl).trim().toLowerCase();
        resolve(line !== "n" && line !== "no");
      }
    };
    process.stdin.on("data", onData);
  });
}

/** Returns first available editor command, or null. Tries: code, cursor, then system default. */
function _findAvailableEditor(): string | null {
  const toTry = ["code", "cursor"];
  for (const cmd of toTry) {
    try {
      execSync(`which ${cmd}`, { stdio: "pipe" });
      return cmd;
    } catch {}
  }
  if (process.env.EDITOR) return process.env.EDITOR;
  if (process.platform === "darwin") return "open -e";
  if (process.platform === "win32") return "notepad";
  return "xdg-open";
}

function _openFileInEditor(filePath: string, editor: string): void {
  const args = editor === "open -e" ? ["-e", filePath] : [filePath];
  const cmd = editor === "open -e" ? "open" : editor;
  spawn(cmd, args, { stdio: "inherit", detached: true }).unref();
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  command: "start" | "init" | "wiz";
  configDir: string;
  /** Project cwd for wizard config. */
  cwd?: string;
  /** Project name for wizard config. */
  name?: string;
  /** Wizard prefill: only set when user passes --engine. */
  engine?: EngineName;
  model?: string;
  apiKey?: string;
  /** Back-compat alias for apiKey. */
  botKey?: string;
  userId?: string;
  session?: string;
  reset?: boolean;
}

function showHelp(): void {
  console.log(`
HAL - AI Code Personal Assistant for Telegram

Usage:
  npx @marcopeg/hal [command] [options]

Commands:
  wiz             Interactive setup wizard (recommended for new users)
  init            Create hal.config.yaml non-interactively (deprecated — use wiz)
  start           Start the bots (default)

Options:
  --config-dir <path> Directory to read/write hal.config.* (default: current directory)
  --cwd <path>        Project cwd to write into config (wizard prefill)
  --name <value>      Project name to write into config (wizard prefill)
  --engine <name>    Engine: claude, copilot, codex, opencode, cursor, antigravity
  --model <name>     Default model for the chosen engine (default: engine default)
  --api-key <value>  Telegram bot token to use for the project (wizard prefill)
  --bot-key <value>  (deprecated) alias for --api-key
  --user-id <value>  Pre-fill Telegram user ID in wizard (skips that step)
  --session <mode>   Pre-fill session mode in wizard: true, false, shared, user
  --reset            Re-ask all wizard questions even if values already exist
  --help, -h         Show this help message

Examples:
  npx @marcopeg/hal wiz
  npx @marcopeg/hal wiz --engine cursor
  npx @marcopeg/hal wiz --engine codex --model gpt-5.2-codex
  npx @marcopeg/hal init
  npx @marcopeg/hal init --engine opencode --model opencode/gpt-5-nano
  npx @marcopeg/hal init --config-dir ./workspace
  npx @marcopeg/hal
  npx @marcopeg/hal --config-dir ./workspace

Configuration (hal.config.json):
  {
    "globals": {
      "engine": { "name": "claude" },
      "logging": { "level": "info", "flow": true, "persist": false },
      "rateLimit": { "max": 10, "windowMs": 60000 }
    },
    "projects": {
      "my-project": {
        "cwd": "./path/to/project",
        "telegram": { "botToken": "your-bot-token" },
        "access": { "allowedUserIds": [123456789] }
      }
    }
  }
`);
}

const VALID_ENGINES: readonly EngineName[] = [
  "claude",
  "copilot",
  "codex",
  "opencode",
  "cursor",
  "antigravity",
];

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let configDir = process.cwd();
  let projectCwd: string | undefined;
  let name: string | undefined;
  let command: "start" | "init" | "wiz" = "start";
  let engine: EngineName | undefined;
  let model: string | undefined;
  let apiKey: string | undefined;
  let botKey: string | undefined;
  let userId: string | undefined;
  let session: string | undefined;
  let reset = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--config-dir" && args[i + 1]) {
      configDir = resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (arg.startsWith("--config-dir=")) {
      configDir = resolve(process.cwd(), arg.slice(13));
    } else if (arg === "--cwd" && args[i + 1]) {
      projectCwd = args[i + 1];
      i++;
    } else if (arg.startsWith("--cwd=")) {
      projectCwd = arg.slice(6);
    } else if (arg === "--name" && args[i + 1]) {
      name = args[i + 1];
      i++;
    } else if (arg.startsWith("--name=")) {
      name = arg.slice(7);
    } else if (arg === "--engine" && args[i + 1]) {
      const val = args[i + 1] as EngineName;
      if (!VALID_ENGINES.includes(val)) {
        console.error(
          `Error: unknown engine "${val}". Valid engines: ${VALID_ENGINES.join(", ")}`,
        );
        process.exit(1);
      }
      engine = val;
      i++;
    } else if (arg.startsWith("--engine=")) {
      const val = arg.slice(9) as EngineName;
      if (!VALID_ENGINES.includes(val)) {
        console.error(
          `Error: unknown engine "${val}". Valid engines: ${VALID_ENGINES.join(", ")}`,
        );
        process.exit(1);
      }
      engine = val;
    } else if (arg === "--model" && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (arg.startsWith("--model=")) {
      model = arg.slice(8);
    } else if (arg === "--api-key" && args[i + 1]) {
      apiKey = args[i + 1];
      i++;
    } else if (arg.startsWith("--api-key=")) {
      apiKey = arg.slice(10);
    } else if (arg === "--bot-key" && args[i + 1]) {
      botKey = args[i + 1];
      i++;
    } else if (arg.startsWith("--bot-key=")) {
      botKey = arg.slice(10);
    } else if (arg === "--user-id" && args[i + 1]) {
      userId = args[i + 1];
      i++;
    } else if (arg.startsWith("--user-id=")) {
      userId = arg.slice(10);
    } else if (arg === "--session" && args[i + 1]) {
      session = args[i + 1];
      i++;
    } else if (arg.startsWith("--session=")) {
      session = arg.slice(10);
    } else if (arg === "--reset") {
      reset = true;
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "wiz") {
      command = "wiz";
    } else if (arg === "init") {
      command = "init";
    } else if (arg === "start") {
      command = "start";
    }
  }

  return {
    command,
    configDir,
    cwd: projectCwd,
    name,
    engine,
    model,
    apiKey,
    botKey,
    userId,
    session,
    reset,
  };
}

// ─── init command ─────────────────────────────────────────────────────────────

const INIT_CONFIG_BASENAMES = [
  "hal.config.json",
  "hal.config.jsonc",
  "hal.config.yaml",
  "hal.config.yml",
];

async function runInit(
  cwd: string,
  engineName: EngineName,
  modelOverride?: string,
  options?: { showDeprecation?: boolean },
): Promise<void> {
  if (options?.showDeprecation !== false) {
    console.log(
      "\u001b[33mNote: `init` is deprecated. Use `npx @marcopeg/hal wiz` for an interactive setup experience.\u001b[0m\n",
    );
  }
  for (const name of INIT_CONFIG_BASENAMES) {
    if (existsSync(join(cwd, name))) {
      console.error(`Error: ${name} already exists in ${cwd}`);
      process.exit(1);
    }
  }

  const projectCwd = "."; // project runs in same dir as config
  const yamlContent = buildYamlInitConfig(
    engineName,
    projectCwd,
    modelOverride,
  );

  console.log("\nProposed configuration (hal.config.yaml):\n");
  console.log("---");
  console.log(yamlContent);
  console.log("---\n");

  const ok = await promptYesNo("Write this to file? (Y/n, Enter = yes): ");
  if (!ok) {
    console.log("Aborted. No file written.");
    process.exit(0);
  }

  const configPath = join(cwd, "hal.config.yaml");
  await writeFile(configPath, yamlContent, "utf-8");
  console.log(`\nConfig: ${configPath}`);

  const engine = getEngine(
    engineName,
    undefined,
    getDefaultProviderModel(engineName, modelOverride),
  );
  const instrFile = engine.instructionsFile();
  const instrPath = join(cwd, instrFile);
  if (!existsSync(instrPath)) {
    await writeFile(
      instrPath,
      "# Project Instructions\n\nAdd your project-specific instructions here.\n",
      "utf-8",
    );
    console.log(`Created ${instrFile}`);
  }

  console.log("\nNext steps:");
  console.log(
    "  1. Set TELEGRAM_BOT_TOKEN in .env or .env.local (see docs: " +
      "https://github.com/marcopeg/hal/blob/main/docs/telegram/README.md#creating-a-telegram-bot" +
      ")",
  );
  console.log(
    "  2. Add your Telegram user ID to access.allowedUserIds (see: " +
      "https://github.com/marcopeg/hal/blob/main/docs/telegram/README.md" +
      ")",
  );
  console.log("  3. Run: npx @marcopeg/hal");
  process.exit(0);
}

// ─── start command ────────────────────────────────────────────────────────────

/**
 * Load config, resolve projects, build contexts, and start all bots.
 * Rejects if config resolution or any bot startup fails.
 * Used for both initial run and hot-reload.
 */
interface RunResult {
  botHandles: BotHandle[];
}

function supportsAnsiColor(
  out: NodeJS.WriteStream = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!out.isTTY) return false;
  if ("NO_COLOR" in env) return false;
  if ((env.TERM ?? "").toLowerCase() === "dumb") return false;
  return true;
}

function renderStartupBanner(useColor: boolean): string {
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

function printStartupBanner(out: NodeJS.WriteStream = process.stdout): void {
  const banner = renderStartupBanner(supportsAnsiColor(out));
  out.write(`${banner}\n\n`);
}

async function runBotsForConfig(
  configDir: string,
  loaded: LoadedConfigResult,
  startupLogger: pino.Logger,
): Promise<RunResult> {
  const { config: multiConfig, loadedFiles } = loaded;
  validateProviderDefaultUniqueness(multiConfig);

  const globals = multiConfig.globals ?? {};

  // Only run CLI discovery when the config has no `providers` key at all.
  // `providers: {}` (empty) means engine/model switching disabled — do not discover.
  const hasProvidersKey = multiConfig.providers !== undefined;
  const enginesWhenNoProviders = !hasProvidersKey
    ? getAvailableEnginesFromCli()
    : undefined;
  if (!hasProvidersKey && enginesWhenNoProviders?.length) {
    startupLogger.info(
      { engines: enginesWhenNoProviders },
      "No providers in config; /engine list from CLI discovery",
    );
  }

  // Resolve all project configs, skip inactive ones (stable order: sorted keys)
  const rootContext = multiConfig.context;
  const projectKeys = Object.keys(multiConfig.projects).sort();
  const allProjects = projectKeys.map((key) =>
    resolveProjectConfig(
      key,
      multiConfig.projects[key],
      globals,
      configDir,
      rootContext,
      multiConfig.providers,
      enginesWhenNoProviders,
    ),
  );

  const resolvedProjects = allProjects.filter((_, i) => {
    const key = projectKeys[i];
    const project = multiConfig.projects[key];
    if (project.active === false) {
      startupLogger.info(`Skipping inactive project "${project.name ?? key}"`);
      return false;
    }
    return true;
  });

  validateProjects(resolvedProjects);
  validateAccessPolicies(resolvedProjects);
  validateEngineEnvFiles(resolvedProjects);

  const sourceLines = loadedFiles.map((f, i) => {
    const isLocal = /hal\.config\.local\.\w+$/.test(f);
    const suffix = isLocal ? "  [local override]" : "";
    return `  ${i + 1}. ${f}${suffix}`;
  });
  sourceLines.push("  env: process.env  (bash context, last resort)");
  for (const project of resolvedProjects) {
    if (project.engineEnvFile) {
      sourceLines.push(
        `  engine.envFile [${project.slug}]: ${project.engineEnvFile}`,
      );
    }
  }
  startupLogger.info(`Configuration sourced:\n${sourceLines.join("\n")}`);

  startupLogger.info(
    { count: resolvedProjects.length },
    "Configuration loaded",
  );

  const contexts: ProjectContext[] = resolvedProjects.map((config) => {
    const logger = createProjectLogger(config);
    const shellCache = config.context
      ? evaluateBootTimeShells(config.context, logger)
      : {};
    const effectiveModel =
      config.engineModel ??
      config.providerDefaultModel ??
      getDefaultEngineModel(config.engine);
    const engine = getEngine(
      config.engine,
      config.engineCommand,
      effectiveModel,
    );
    return { config, logger, bootContext: { shellCache }, engine };
  });

  for (const { config } of contexts) {
    if (!config.logging.flow) {
      startupLogger.info(
        `Bot "${config.slug}" has terminal logging suppressed.${config.logging.persist ? ` Persisted logs can be read at: ${config.logDir}` : ""}`,
      );
    }
  }

  const botHandles = await Promise.all(contexts.map((ctx) => startBot(ctx)));
  startupLogger.info({ count: botHandles.length }, "All bots running");
  return { botHandles };
}

const STARTUP_BANNER_DELAY_MS = 500;

const HAL_DOCS_URL = "https://github.com/marcopeg/hal";
const HAL_QUICK_START = "npx @marcopeg/hal wiz";

function openUrl(url: string): void {
  try {
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "start"
          : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // ignore
  }
}

function printConfigError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  console.error("\n\u001b[1;31mConfiguration error\u001b[0m\n");
  console.error(message);
  console.error("\n\u001b[1m— Need help?\u001b[0m");
  console.error(`  Documentation: ${HAL_DOCS_URL}`);
  console.error(`  Quick start:   ${HAL_QUICK_START}`);
  console.error("");
  process.exit(1);
}

async function runStart(
  configDir: string,
  wizardPrefill: Record<string, unknown>,
): Promise<void> {
  // Always show the HAL startup banner first (even if we end up suggesting the wizard).
  printStartupBanner();

  // If config is missing or incomplete, offer to run the wizard (TTY only).
  // We do NOT auto-run it: users may prefer to keep the current behavior and see the error.
  {
    const { analyzeConfig } = await import("./wizard/analyzer.js");
    const analysis = analyzeConfig(configDir);

    if (!analysis.configExists) {
      if (process.stdin.isTTY) {
        const action = await select({
          message: "Configuration is missing, what do you want to do?",
          options: [
            {
              value: "wiz",
              label: "Start the interactive setup wizard (recommended)",
            },
            {
              value: "basic",
              label: "Generate a basic config file to complete with your data",
            },
            { value: "docs", label: "Open the configuration documentation" },
          ],
          initialValue: "wiz",
        });

        if (isCancel(action)) {
          outro("Aborted.");
          process.exit(0);
        }

        if (action === "wiz") {
          const { startWizard } = await import("./wizard/index.js");
          const shouldContinue = await startWizard(
            configDir,
            wizardPrefill as never,
            false,
            { showBanner: false },
          );
          if (!shouldContinue) return;
        } else if (action === "basic") {
          await runInit(configDir, "codex", undefined, {
            showDeprecation: false,
          });
          return;
        } else {
          const url =
            "https://github.com/marcopeg/hal/blob/main/docs/config/README.md";
          openUrl(url);
          console.log(`\n  Docs: ${url}\n`);
          return;
        }
      } else {
        console.error(
          '\nConfiguration is missing. Run "npx @marcopeg/hal wiz" to set up interactively.\n',
        );
      }
    } else if (analysis.missingFields.length > 0) {
      if (process.stdin.isTTY) {
        const yes = await promptYesNo(
          "\nConfiguration looks incomplete.\nRun the interactive setup wizard now? (Y/n) ",
        );
        if (yes) {
          const { startWizard } = await import("./wizard/index.js");
          const shouldContinue = await startWizard(
            configDir,
            wizardPrefill as never,
            false,
            { showBanner: false },
          );
          if (!shouldContinue) return;
        }
      } else {
        console.error(
          '\nConfiguration looks incomplete. Run "npx @marcopeg/hal wiz" to set up interactively.\n',
        );
      }
    }
  }

  await new Promise((resolve) => setTimeout(resolve, STARTUP_BANNER_DELAY_MS));
  const startupLogger = createStartupLogger();

  startupLogger.info({ configDir }, "Loading configuration");

  let loaded: LoadedConfigResult;
  try {
    loaded = tryLoadMultiConfig(configDir);
  } catch (err) {
    printConfigError(err);
  }

  // Single source of truth for current bot handles. Reload and shutdown use this.
  // Startup: config or bot failure still exits the process (no resilient behaviour).
  // Reload: on failure we set botHandles to [] (degraded), keep watcher running;
  // next config file change triggers another reload; fix and save → auto-recover.
  const state: { botHandles: RunResult["botHandles"] } = { botHandles: [] };

  let runResult: RunResult;
  try {
    runResult = await runBotsForConfig(configDir, loaded, startupLogger);
  } catch (err) {
    startupLogger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to start one or more bots — aborting",
    );
    process.exit(1);
  }
  state.botHandles = runResult.botHandles;

  let reloading = false;
  const watcherExtraPaths =
    loaded.config.env !== undefined
      ? (() => {
          const { mainPath, localPath } = resolveCustomEnvPaths(
            configDir,
            loaded.config.env!,
          );
          return [mainPath, localPath];
        })()
      : undefined;
  const configWatcher = startConfigWatcher(
    configDir,
    async () => {
      if (reloading) return;
      reloading = true;
      try {
        printStartupBanner();
        await new Promise((resolve) =>
          setTimeout(resolve, STARTUP_BANNER_DELAY_MS),
        );
        startupLogger.info("Config change detected");
        const hadBots = state.botHandles.length > 0;
        await Promise.all(
          state.botHandles.map((h) => h.stop().catch(() => {})),
        );
        state.botHandles = [];
        if (hadBots) startupLogger.info("All bots stopped");

        const wasDegraded = !hadBots;
        try {
          const reloaded = tryLoadMultiConfig(configDir);
          const nextResult = await runBotsForConfig(
            configDir,
            reloaded,
            startupLogger,
          );
          state.botHandles = nextResult.botHandles;
          if (wasDegraded) {
            startupLogger.info("Exiting degraded state; all bots running");
          }
          // runBotsForConfig already logs "All bots running" on success
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          startupLogger.error(
            { error: message, err: err instanceof Error ? err : undefined },
            "Reload failed; in degraded state, waiting for corrected config",
          );
          state.botHandles = [];
        }
      } finally {
        reloading = false;
      }
    },
    watcherExtraPaths ? { extraPaths: watcherExtraPaths } : {},
  );

  async function shutdown(signal: string): Promise<void> {
    startupLogger.info({ signal }, "Received shutdown signal");
    await configWatcher.stop();
    await Promise.all(state.botHandles.map((h) => h.stop().catch(() => {})));
    if (state.botHandles.length > 0) startupLogger.info("All bots stopped");
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const {
    command,
    configDir,
    cwd,
    name,
    engine,
    model,
    apiKey,
    botKey,
    userId,
    session,
    reset,
  } = parseArgs();

  if (command === "wiz") {
    const { startWizard } = await import("./wizard/index.js");
    const shouldStart = await startWizard(
      configDir,
      { name, cwd, engine, model, apiKey, botKey, userId, session },
      reset ?? false,
      { showBanner: true },
    );
    if (shouldStart) {
      await runStart(configDir, {
        name,
        cwd,
        engine,
        model,
        apiKey,
        botKey,
        userId,
        session,
      });
    }
    return;
  }

  if (command === "init") {
    await runInit(configDir, engine ?? "codex", model, {
      showDeprecation: true,
    });
  } else {
    await runStart(configDir, {
      name,
      cwd,
      engine,
      model,
      apiKey,
      botKey,
      userId,
      session,
    });
  }
}

main().catch((error) => {
  console.error("Failed to start:", error.message || error);
  process.exit(1);
});
