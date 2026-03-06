import { multiselect, select, spinner } from "@clack/prompts";
import {
  getCursorModelsFromCli,
  getOpencodeModelsFromCli,
} from "../../engine/opencode-models.js";
import { defaultEngineCommand, type EngineName } from "../engine-discovery.js";
import { guardCancel } from "../runner.js";
import type { WizardContext, WizardStep } from "../types.js";

const VALID_ENGINES = [
  "claude",
  "copilot",
  "codex",
  "opencode",
  "cursor",
  "antigravity",
] as const;

export const engineStep: WizardStep = {
  id: "engine",
  label: "Engines and default",

  isConfigured(ctx: WizardContext): boolean {
    const globalEngine = ctx.existingConfig?.globals?.engine?.name;
    const projects = ctx.existingConfig?.projects ?? {};
    const projectEngine = Object.values(projects).some((p) => p.engine?.name);
    return !!(globalEngine || projectEngine);
  },

  shouldSkip(ctx: WizardContext): boolean {
    const e = ctx.prefill.engine;
    return (
      typeof e === "string" && (VALID_ENGINES as readonly string[]).includes(e)
    );
  },

  run: async (ctx: WizardContext) => {
    // Prefill: engine flag means "enable only this engine and set it as default".
    if (
      ctx.prefill.engine &&
      (VALID_ENGINES as readonly string[]).includes(ctx.prefill.engine)
    ) {
      const engine = ctx.prefill.engine as EngineName;
      ctx.results.enabledEngines = [engine];
      ctx.results.engine = engine;

      // Model prefill: only for self-discovery engines, and only if valid in discovered list.
      const m = ctx.prefill.model;
      if (engine === "cursor" || engine === "opencode") {
        const cmd = defaultEngineCommand(engine);
        const models =
          engine === "cursor"
            ? getCursorModelsFromCli(ctx.cwd, cmd)
            : getOpencodeModelsFromCli(ctx.cwd, cmd);
        if (typeof m === "string" && models.some((x) => x.name === m)) {
          ctx.results.model = m;
        } else {
          ctx.results.model = undefined;
        }
      } else {
        ctx.results.model = undefined;
      }
      return;
    }

    let availableList: EngineName[] = [];
    if (ctx.availableEnginesPromise) {
      // If discovery hasn't finished yet, show a spinner so it doesn't feel stuck.
      const s = spinner();
      s.start("Investigating which engines are available in your system...");
      try {
        const res = await ctx.availableEnginesPromise;
        availableList = (res as string[]).filter((e) =>
          (VALID_ENGINES as readonly string[]).includes(e),
        ) as EngineName[];
      } finally {
        s.stop("Engine discovery complete");
      }
    }

    const available = new Set<EngineName>(availableList);

    const options = VALID_ENGINES.map((e) => ({
      value: e,
      label: available.has(e) ? e : `${e} (not detected)`,
    }));

    const initial =
      available.size > 0
        ? VALID_ENGINES.filter((e) => available.has(e))
        : (["codex"] as EngineName[]);

    console.log("  Tip: Space to toggle, Enter to confirm.");

    // Enable engines (providers)
    const enabled = await multiselect({
      message: "Which engines do you want to enable on this machine?",
      options,
      initialValues: initial,
      required: true,
    });
    guardCancel(enabled);

    const enabledEngines = enabled as EngineName[];

    // Default engine (only ask when 2+ enabled)
    let defaultEngine: EngineName | undefined;
    if (
      ctx.prefill.engine &&
      VALID_ENGINES.includes(ctx.prefill.engine as EngineName) &&
      enabledEngines.includes(ctx.prefill.engine as EngineName)
    ) {
      defaultEngine = ctx.prefill.engine as EngineName;
      console.log(`  Default engine pre-filled: ${defaultEngine}`);
    } else if (enabledEngines.length >= 2) {
      const answer = await select({
        message: "Which engine should be used by default?",
        options: enabledEngines.map((e) => ({ value: e, label: e })),
      });
      guardCancel(answer);
      defaultEngine = answer as EngineName;
    } else {
      defaultEngine = enabledEngines[0];
    }

    ctx.results.enabledEngines = enabledEngines;
    ctx.results.engine = defaultEngine;

    const engineForModels = defaultEngine;
    if (engineForModels === "cursor" || engineForModels === "opencode") {
      const s = spinner();
      s.start("Fetching available models...");
      const cmd = defaultEngineCommand(engineForModels);
      const models =
        engineForModels === "cursor"
          ? getCursorModelsFromCli(ctx.cwd, cmd)
          : getOpencodeModelsFromCli(ctx.cwd, cmd);
      s.stop(models.length > 0 ? "Models loaded" : "No models discovered");

      // Prefill model: validate against discovered list (only for self-discovery engines)
      if (
        ctx.prefill.model &&
        models.some((m) => m.name === ctx.prefill.model)
      ) {
        ctx.results.model = ctx.prefill.model;
        console.log(`  Model pre-filled: ${ctx.prefill.model}`);
        return;
      }

      if (models.length > 0) {
        const picked = await select({
          message: "Which model should be used by default?",
          options: models.map((m) => ({ value: m.name, label: m.name })),
        });
        guardCancel(picked);
        ctx.results.model = picked as string;
      } else {
        // Leave globals.engine.model unset
        ctx.results.model = undefined;
      }
    } else {
      // Leave globals.engine.model unset
      ctx.results.model = undefined;
    }
  },
};
