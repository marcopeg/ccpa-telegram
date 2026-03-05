#!/usr/bin/env node

import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type pino from "pino";
import { type BotHandle, startBot } from "./bot.js";
import type { LoadedConfigResult } from "./config.js";
import {
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

// ─── Init: doc URLs (GitHub marcopeg/hal + docs path) ──────────────────────────

const HAL_DOCS_BASE = "https://github.com/marcopeg/hal/blob/main/docs";
const HAL_DOCS_TELEGRAM = `${HAL_DOCS_BASE}/telegram/README.md`;
const HAL_DOCS_TELEGRAM_CREATE_BOT = `${HAL_DOCS_BASE}/telegram/README.md#creating-a-telegram-bot`;
const HAL_DOCS_CONFIG = `${HAL_DOCS_BASE}/config/README.md`;

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
  const template = readFileSync(INIT_TEMPLATE_PATH, "utf-8");
  return template
    .replace(/\{\{ENGINE_NAME\}\}/g, engineName)
    .replace(/\{\{ENGINE_MODEL\}\}/g, model)
    .replace(/\{\{PROJECT_CWD\}\}/g, JSON.stringify(projectCwd))
    .replace(/\{\{HAL_DOCS_CONFIG\}\}/g, HAL_DOCS_CONFIG)
    .replace(/\{\{HAL_DOCS_TELEGRAM\}\}/g, HAL_DOCS_TELEGRAM)
    .replace(
      /\{\{HAL_DOCS_TELEGRAM_CREATE_BOT\}\}/g,
      HAL_DOCS_TELEGRAM_CREATE_BOT,
    );
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
function findAvailableEditor(): string | null {
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

function openFileInEditor(filePath: string, editor: string): void {
  const args = editor === "open -e" ? ["-e", filePath] : [filePath];
  const cmd = editor === "open -e" ? "open" : editor;
  spawn(cmd, args, { stdio: "inherit", detached: true }).unref();
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────

interface ParsedArgs {
  command: "start" | "init";
  cwd: string;
  engine: EngineName;
  model?: string;
}

function showHelp(): void {
  console.log(`
HAL - AI Code Personal Assistant for Telegram

Usage:
  npx @marcopeg/hal [command] [options]

Commands:
  init            Create hal.config.yaml in the working directory (with confirmation)
  start           Start the bots (default)

Options:
  --cwd <path>      Directory for config file and project cwd (default: current directory)
  --engine <name>   Engine: claude, copilot, codex, opencode, cursor, antigravity (default: codex)
  --model <name>    Default model for the chosen engine (default: engine default)
  --help, -h        Show this help message

Examples:
  npx @marcopeg/hal init
  npx @marcopeg/hal init --engine opencode --model opencode/gpt-5-nano
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
  "antigravity",
];

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let cwd = process.cwd();
  let command: "start" | "init" = "start";
  let engine: EngineName = "codex";
  let model: string | undefined;

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
    } else if (arg === "--model" && args[i + 1]) {
      model = args[i + 1];
      i++;
    } else if (arg.startsWith("--model=")) {
      model = arg.slice(8);
    } else if (arg === "--help" || arg === "-h") {
      showHelp();
      process.exit(0);
    } else if (arg === "init") {
      command = "init";
    } else if (arg === "start") {
      command = "start";
    }
  }

  return { command, cwd, engine, model };
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
): Promise<void> {
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
      HAL_DOCS_TELEGRAM_CREATE_BOT +
      ")",
  );
  console.log(
    "  2. Add your Telegram user ID to access.allowedUserIds (see: " +
      HAL_DOCS_TELEGRAM +
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

const HAL_DOCS_URL = "https://github.com/marcopeg/hal";
const HAL_QUICK_START = "npx @marcopeg/hal init";

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

async function runStart(configDir: string): Promise<void> {
  printStartupBanner();
  await new Promise((resolve) => setTimeout(resolve, STARTUP_BANNER_DELAY_MS));
  const startupLogger = createStartupLogger();

  startupLogger.info({ configDir }, "Loading configuration");

  let loaded: LoadedConfigResult;
  try {
    loaded = tryLoadMultiConfig(configDir);
  } catch (err) {
    printConfigError(err);
  }

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
  const { command, cwd, engine, model } = parseArgs();

  if (command === "init") {
    await runInit(cwd, engine, model);
  } else {
    await runStart(cwd);
  }
}

main().catch((error) => {
  console.error("Failed to start:", error.message || error);
  process.exit(1);
});
