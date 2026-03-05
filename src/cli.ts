#!/usr/bin/env node

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type pino from "pino";
import { type BotHandle, startBot } from "./bot.js";
import type { LoadedConfigResult } from "./config.js";
import {
  loadMultiConfig,
  resolveProjectConfig,
  tryLoadMultiConfig,
  validateAccessPolicies,
  validateProjects,
  validateProviderDefaultUniqueness,
} from "./config.js";
import { startConfigWatcher } from "./config-watcher.js";
import { evaluateBootTimeShells } from "./context/resolver.js";
import { getDefaultEngineModel } from "./default-models.js";
import { getEngine } from "./engine/index.js";
import type { EngineName } from "./engine/types.js";
import { createProjectLogger, createStartupLogger } from "./logger.js";
import type { ProjectContext } from "./types.js";

// ─── Config template ──────────────────────────────────────────────────────────

function buildConfigTemplate(engineName: EngineName): string {
  return `{
  "globals": {
    "engine": {
      "name": "${engineName}"
    },
    "logging": {
      "level": "info",
      "flow": true,
      "persist": false
    },
    "rateLimit": {
      "max": 10,
      "windowMs": 60000
    },
    "access": {
      "allowedUserIds": [0]
    }
  },
  "projects": {
    "my-project": {
      "cwd": ".",
      "telegram": {
        "botToken": "YOUR_BOT_TOKEN_HERE"
      }
    }
  }
}
`;
}
// Note: The "context" key can be added to globals or per-project to inject
// metadata into every prompt. Implicit context (bot.*, sys.*) is always
// available. See the task docs or examples/ for details.

// ─── CLI argument parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  command: "start" | "init";
  cwd: string;
  engine: EngineName;
}

function showHelp(): void {
  console.log(`
HAL - AI Code Personal Assistant for Telegram

Usage:
  npx @marcopeg/hal [command] [options]

Commands:
  init            Create hal.config.json in the working directory
  start           Start the bots (default)

Options:
  --cwd <path>      Directory containing hal.config.{json,jsonc,yaml} (default: current directory)
  --engine <name>   Engine to use: claude, copilot, codex, opencode, cursor (default: claude)
  --help, -h        Show this help message

Examples:
  npx @marcopeg/hal init
  npx @marcopeg/hal init --engine copilot
  npx @marcopeg/hal init --cwd ./workspace
  npx @marcopeg/hal
  npx @marcopeg/hal --cwd ./workspace

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
];

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let cwd = process.cwd();
  let command: "start" | "init" = "start";
  let engine: EngineName = "claude";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--cwd" && args[i + 1]) {
      cwd = resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (arg.startsWith("--cwd=")) {
      cwd = resolve(process.cwd(), arg.slice(6));
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
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "init") {
      command = "init";
    } else if (arg === "start") {
      command = "start";
    }
  }

  return { command, cwd, engine };
}

// ─── init command ─────────────────────────────────────────────────────────────

async function runInit(cwd: string, engineName: EngineName): Promise<void> {
  const configPath = join(cwd, "hal.config.json");

  if (existsSync(configPath)) {
    console.error(`Error: hal.config.json already exists in ${cwd}`);
    process.exit(1);
  }

  // Write config with the selected engine
  const template = buildConfigTemplate(engineName);
  await writeFile(configPath, template, "utf-8");
  console.log(`Created hal.config.json in ${cwd} (engine: ${engineName})`);

  // Scaffold engine-specific instructions file
  const effectiveModel = getDefaultEngineModel(engineName);
  const engine = getEngine(engineName, undefined, effectiveModel);
  const instrFile = engine.instructionsFile();
  const instrPath = join(cwd, instrFile);
  if (!existsSync(instrPath)) {
    await writeFile(
      instrPath,
      `# Project Instructions\n\nAdd your project-specific instructions here.\n`,
      "utf-8",
    );
    console.log(`Created ${instrFile}`);
  }

  console.log(`\nNext steps:`);
  console.log(
    `1. Edit hal.config.json and set your Telegram bot token in projects.my-project.telegram.botToken`,
  );
  console.log(`2. Set the project cwd to the folder the engine should work in`);
  console.log(
    `3. Replace 0 in access.allowedUserIds with your Telegram user ID (required)`,
  );
  console.log(`4. Run: npx @marcopeg/hal --cwd ${cwd}`);
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

  const sourceLines = loadedFiles.map((f, i) => {
    const isLocal = /hal\.config\.local\.\w+$/.test(f);
    const suffix = isLocal ? "  [local override]" : "";
    return `  ${i + 1}. ${f}${suffix}`;
  });
  sourceLines.push("  env: process.env  (bash context, last resort)");
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

async function runStart(configDir: string): Promise<void> {
  printStartupBanner();
  await new Promise((resolve) => setTimeout(resolve, STARTUP_BANNER_DELAY_MS));
  const startupLogger = createStartupLogger();

  startupLogger.info({ configDir }, "Loading configuration");

  const loaded = loadMultiConfig(configDir);

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

  let reloading = false;
  const configWatcher = startConfigWatcher(configDir, async () => {
    if (reloading) return;
    reloading = true;
    try {
      startupLogger.info("Config change detected");
      await Promise.all(
        runResult.botHandles.map((h) => h.stop().catch(() => {})),
      );
      startupLogger.info("All bots stopped");
      try {
        const result = tryLoadMultiConfig(configDir);
        runResult = await runBotsForConfig(configDir, result, startupLogger);
      } catch (err) {
        startupLogger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Reload failed",
        );
        process.exit(1);
      }
    } finally {
      reloading = false;
    }
  });

  async function shutdown(signal: string): Promise<void> {
    startupLogger.info({ signal }, "Received shutdown signal");
    await configWatcher.stop();
    await Promise.all(
      runResult.botHandles.map((h) => h.stop().catch(() => {})),
    );
    startupLogger.info("All bots stopped");
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, cwd, engine } = parseArgs();

  if (command === "init") {
    await runInit(cwd, engine);
  } else {
    await runStart(cwd);
  }
}

main().catch((error) => {
  console.error("Failed to start:", error.message || error);
  process.exit(1);
});
