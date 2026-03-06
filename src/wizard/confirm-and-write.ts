import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { confirm, select } from "@clack/prompts";
import { resolveCustomEnvPaths } from "../config.js";
import { getEngine } from "../engine/index.js";
import { buildConfigFromResults } from "./config-builder.js";
import { guardCancel } from "./runner.js";
import type { WizardContext } from "./types.js";

/**
 * Final wizard step: show summary, confirm, write config, offer to start.
 * Stores `ctx.results.startBot = true` when the user wants to start.
 */
export async function runConfirmAndWrite(ctx: WizardContext): Promise<void> {
  // Ask secrets mode before generating previews
  const secretsMode = await select({
    message: "Where should API keys and user IDs be stored?",
    options: [
      { value: "env", label: "Use .env variables (recommended)" },
      { value: "inline", label: "Inline in config file" },
    ],
  });
  guardCancel(secretsMode);
  ctx.results.secretsMode = secretsMode as "env" | "inline";

  const built = buildConfigFromResults(ctx);

  console.log("\n─── Proposed configuration ──────────────────────────────\n");
  console.log(built.content);
  console.log("─────────────────────────────────────────────────────────\n");

  if (built.envEntries && Object.keys(built.envEntries).length > 0) {
    const envPath = pickEnvPath(ctx);
    console.log(`Proposed ${envPath} entries:\n`);
    for (const [k, v] of Object.entries(built.envEntries)) {
      console.log(`  ${k}=${v}`);
    }
    console.log(
      "\n─────────────────────────────────────────────────────────\n",
    );
  }

  const ok = await confirm({
    message:
      built.envEntries && Object.keys(built.envEntries).length > 0
        ? "Write config and .env changes?"
        : "Write this configuration?",
  });
  guardCancel(ok);

  if (!ok) {
    console.log("Aborted. No files were written.");
    process.exit(0);
  }

  // Write config file
  writeFileSync(built.targetPath, built.content, "utf-8");
  console.log(`\n  Config written: ${built.targetPath}`);

  // Write env entries
  if (built.envEntries && Object.keys(built.envEntries).length > 0) {
    const envPath = pickEnvPath(ctx);
    upsertEnvFile(envPath, built.envEntries);
    console.log(`  Env updated:    ${envPath}`);
  }

  // Create engine instructions file if missing
  const engineName = (ctx.results as Record<string, unknown>).engine as
    | string
    | undefined;
  if (engineName) {
    try {
      const engine = getEngine(
        engineName as Parameters<typeof getEngine>[0],
        undefined,
        "",
      );
      const instrFile = engine.instructionsFile();
      const instrPath = join(ctx.cwd, instrFile);
      if (!existsSync(instrPath)) {
        writeFileSync(
          instrPath,
          "# Project Instructions\n\nAdd your project-specific instructions here.\n",
          "utf-8",
        );
        console.log(`  Created:        ${instrFile}`);
      }
    } catch {
      // engine lookup failed — not critical
    }
  }

  console.log("");

  const action = await select({
    message: "What would you like to do next?",
    options: [
      { value: "start", label: "Start the bot now" },
      { value: "exit", label: "Exit" },
    ],
  });
  guardCancel(action);

  if (action === "start") {
    (ctx.results as Record<string, unknown>).startBot = true;
  } else {
    console.log("Setup complete! Run `npx @marcopeg/hal` when you're ready.");
    process.exit(0);
  }
}

function pickEnvPath(ctx: WizardContext): string {
  // Respect existing config's custom env path (task 041).
  const configured = ctx.existingConfig?.env;
  if (typeof configured === "string" && configured.trim() !== "") {
    const { mainPath } = resolveCustomEnvPaths(ctx.cwd, configured);
    return mainPath;
  }

  const envLocal = join(ctx.cwd, ".env.local");
  const env = join(ctx.cwd, ".env");
  if (existsSync(env)) return env;
  if (existsSync(envLocal)) return envLocal;
  return env;
}

function upsertEnvFile(envPath: string, entries: Record<string, string>): void {
  const content = existsSync(envPath) ? readFileSync(envPath, "utf-8") : "";
  const lines = content.split(/\r?\n/);
  const keys = new Set(Object.keys(entries));

  const out: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    const key = m[1];
    if (!keys.has(key)) {
      out.push(line);
      continue;
    }
    if (seen.has(key)) continue;
    out.push(`${key}=${entries[key]}`);
    seen.add(key);
  }

  for (const [k, v] of Object.entries(entries)) {
    if (seen.has(k)) continue;
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    out.push(`${k}=${v}`);
  }

  // Ensure trailing newline
  const final = out.join("\n").replace(/\n*$/, "\n");
  writeFileSync(envPath, final, "utf-8");
}
