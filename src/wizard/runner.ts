import { isCancel, outro } from "@clack/prompts";
import type { WizardContext, WizardStep } from "./types.js";

/**
 * Iterates through the step registry. For each step:
 * - Skips if isConfigured() returns true AND --reset is false.
 * - If shouldSkip() returns true (e.g. prefill provided), runs the step without prompting.
 * - Shows progress ("Step N of M").
 * - Calls run().
 * - Handles Ctrl+C (isCancel) at any point via a thrown symbol that prompts catch.
 */
export async function runWizard(
  ctx: WizardContext,
  steps: WizardStep[],
): Promise<void> {
  const promptingSteps = ctx.reset
    ? steps
    : steps.filter((s) => {
        const skip = s.shouldSkip?.(ctx) ?? false;
        if (skip) return false;
        if (s.isConfigured(ctx)) return false;
        return true;
      });

  let shown = 0;

  for (const step of steps) {
    const skip = !ctx.reset && (step.shouldSkip?.(ctx) ?? false);
    const configured = !ctx.reset && step.isConfigured(ctx);

    if (configured) continue;

    if (skip) {
      // Apply prefill silently (no progress line, no prompt expected).
      await step.run(ctx);
      continue;
    }

    shown += 1;
    process.stdout.write(
      `\n[Step ${shown}/${promptingSteps.length}] ${step.label}\n`,
    );
    await step.run(ctx);
  }
}

/**
 * Call after any @clack/prompts prompt returns a value to check for cancellation.
 * Exits the process cleanly if the user pressed Ctrl+C.
 */
export function guardCancel(value: unknown): void {
  if (isCancel(value)) {
    outro("Setup cancelled. No files were written.");
    process.exit(0);
  }
}
