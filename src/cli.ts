#!/usr/bin/env node

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { startBot } from "./bot.js";
import {
  loadMultiConfig,
  resolveProjectConfig,
  validateProjects,
} from "./config.js";
import { createProjectLogger, createStartupLogger } from "./logger.js";
import type { ProjectContext } from "./types.js";

// ─── Config template ──────────────────────────────────────────────────────────

const CONFIG_TEMPLATE = `{
  "globals": {
    "claude": {
      "command": "claude"
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

// ─── CLI argument parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  command: "start" | "init";
  cwd: string;
}

function showHelp(): void {
  console.log(`
ccpa-telegram - Claude Code Personal Assistant for Telegram

Usage:
  npx ccpa-telegram [command] [options]

Commands:
  init            Create ccpa.config.json in the working directory
  start           Start the bots (default)

Options:
  --cwd <path>    Directory containing ccpa.config.json (default: current directory)
  --help, -h      Show this help message

Examples:
  npx ccpa-telegram init
  npx ccpa-telegram init --cwd ./workspace
  npx ccpa-telegram
  npx ccpa-telegram --cwd ./workspace

Configuration (ccpa.config.json):
  {
    "globals": {
      "claude": { "command": "claude" },
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

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let cwd = process.cwd();
  let command: "start" | "init" = "start";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--cwd" && args[i + 1]) {
      cwd = resolve(process.cwd(), args[i + 1]);
      i++;
    } else if (arg.startsWith("--cwd=")) {
      cwd = resolve(process.cwd(), arg.slice(6));
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "init") {
      command = "init";
    } else if (arg === "start") {
      command = "start";
    }
  }

  return { command, cwd };
}

// ─── init command ─────────────────────────────────────────────────────────────

async function runInit(cwd: string): Promise<void> {
  const configPath = join(cwd, "ccpa.config.json");

  if (existsSync(configPath)) {
    console.error(`Error: ccpa.config.json already exists in ${cwd}`);
    process.exit(1);
  }

  await writeFile(configPath, CONFIG_TEMPLATE, "utf-8");
  console.log(`Created ccpa.config.json in ${cwd}`);
  console.log(`\nNext steps:`);
  console.log(
    `1. Edit ccpa.config.json and set your Telegram bot token in projects[0].telegram.botToken`,
  );
  console.log(`2. Set the project cwd to the folder Claude should work in`);
  console.log(`3. Add allowed user IDs to the "allowedUserIds" array`);
  console.log(`4. Run: npx ccpa-telegram --cwd ${cwd}`);
  process.exit(0);
}

// ─── start command ────────────────────────────────────────────────────────────

async function runStart(configDir: string): Promise<void> {
  const startupLogger = createStartupLogger();

  startupLogger.info({ configDir }, "Loading configuration");

  // Load and validate the multi-project config
  const multiConfig = loadMultiConfig(configDir);
  const globals = multiConfig.globals ?? {};

  // Resolve all project configs
  const resolvedProjects = multiConfig.projects.map((project) =>
    resolveProjectConfig(project, globals, configDir),
  );

  // Boot-time validation (unique cwds, tokens, names)
  validateProjects(resolvedProjects);

  startupLogger.info(
    { count: resolvedProjects.length },
    "Configuration loaded",
  );

  // Build project contexts
  const contexts: ProjectContext[] = resolvedProjects.map((config) => ({
    config,
    logger: createProjectLogger(config),
  }));

  // Emit startup notices for flow=false projects
  for (const { config } of contexts) {
    if (!config.logging.flow) {
      startupLogger.info(
        `Bot "${config.slug}" has terminal logging suppressed.${config.logging.persist ? ` Persisted logs can be read at: ${config.logDir}` : ""}`,
      );
    }
  }

  // Start all bots concurrently — abort all if any fails
  let handles: { stop: () => Promise<void> }[];
  try {
    handles = await Promise.all(contexts.map((ctx) => startBot(ctx)));
  } catch (err) {
    startupLogger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to start one or more bots — aborting",
    );
    process.exit(1);
  }

  startupLogger.info({ count: handles.length }, "All bots running");

  // Graceful shutdown handler
  async function shutdown(signal: string): Promise<void> {
    startupLogger.info({ signal }, "Received shutdown signal");
    await Promise.all(handles.map((h) => h.stop().catch(() => {})));
    startupLogger.info("All bots stopped");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, cwd } = parseArgs();

  if (command === "init") {
    await runInit(cwd);
  } else {
    await runStart(cwd);
  }
}

main().catch((error) => {
  console.error("Failed to start:", error.message || error);
  process.exit(1);
});
