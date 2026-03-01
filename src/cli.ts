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
  validateProjects,
} from "./config.js";
import { startConfigWatcher } from "./config-watcher.js";
import { evaluateBootTimeShells } from "./context/resolver.js";
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
      "allowedUserIds": []
    }
  },
  "projects": [
    {
      "name": "my-project",
      "cwd": ".",
      "telegram": {
        "botToken": "YOUR_BOT_TOKEN_HERE"
      },
      "access": {
        "allowedUserIds": []
      }
    }
  ]
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
  --cwd <path>      Directory containing hal.config.json (default: current directory)
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
    "projects": [
      {
        "name": "my-project",
        "cwd": "./path/to/project",
        "telegram": { "botToken": "your-bot-token" },
        "access": { "allowedUserIds": [123456789] }
      }
    ]
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
  const engine = getEngine(engineName);
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
    `1. Edit hal.config.json and set your Telegram bot token in projects[0].telegram.botToken`,
  );
  console.log(`2. Set the project cwd to the folder the engine should work in`);
  console.log(`3. Add allowed user IDs to the "allowedUserIds" array`);
  console.log(`4. Run: npx @marcopeg/hal --cwd ${cwd}`);
  process.exit(0);
}

// ─── start command ────────────────────────────────────────────────────────────

/**
 * Load config, resolve projects, build contexts, and start all bots.
 * Rejects if config resolution or any bot startup fails.
 * Used for both initial run and hot-reload.
 */
async function runBotsForConfig(
  configDir: string,
  loaded: LoadedConfigResult,
  startupLogger: pino.Logger,
): Promise<BotHandle[]> {
  const { config: multiConfig, loadedFiles } = loaded;
  const globals = multiConfig.globals ?? {};

  // Resolve all project configs, skip inactive ones
  const rootContext = multiConfig.context;
  const allProjects = multiConfig.projects.map((project) =>
    resolveProjectConfig(project, globals, configDir, rootContext),
  );

  const resolvedProjects = allProjects.filter((_, i) => {
    const project = multiConfig.projects[i];
    if (project.active === false) {
      startupLogger.info(
        `Skipping inactive project "${project.name ?? project.cwd}"`,
      );
      return false;
    }
    return true;
  });

  validateProjects(resolvedProjects);

  const sourceLines = loadedFiles.map((f, i) => {
    const isLocal = f.endsWith("hal.config.local.json");
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
    const engine = getEngine(
      config.engine,
      config.engineCommand,
      config.engineModel,
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

  const handles = await Promise.all(contexts.map((ctx) => startBot(ctx)));
  startupLogger.info({ count: handles.length }, "All bots running");
  return handles;
}

async function runStart(configDir: string): Promise<void> {
  const startupLogger = createStartupLogger();

  startupLogger.info({ configDir }, "Loading configuration");

  const loaded = loadMultiConfig(configDir);

  let handles: BotHandle[];
  try {
    handles = await runBotsForConfig(configDir, loaded, startupLogger);
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
      await Promise.all(handles.map((h) => h.stop()));
      startupLogger.info("All bots stopped");
      try {
        const result = tryLoadMultiConfig(configDir);
        handles = await runBotsForConfig(configDir, result, startupLogger);
      } catch (err) {
        startupLogger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Reload failed",
        );
      }
    } finally {
      reloading = false;
    }
  });

  async function shutdown(signal: string): Promise<void> {
    startupLogger.info({ signal }, "Received shutdown signal");
    await configWatcher.stop();
    await Promise.all(handles.map((h) => h.stop().catch(() => {})));
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
