import { text } from "@clack/prompts";
import { guardCancel } from "../runner.js";
import type { WizardContext, WizardStep } from "../types.js";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "prj1"
  );
}

export const projectNameStep: WizardStep = {
  id: "project-name",
  label: "Project name",

  isConfigured(ctx: WizardContext): boolean {
    // Skip if an existing project key is already present (gap-fill mode)
    const projects = ctx.existingConfig?.projects ?? {};
    return Object.keys(projects).length > 0;
  },

  shouldSkip(ctx: WizardContext): boolean {
    return (
      typeof ctx.prefill.name === "string" && ctx.prefill.name.trim() !== ""
    );
  },

  run: async (ctx: WizardContext) => {
    // Pre-fill: apply silently
    if (ctx.prefill.name) {
      const pre = ctx.prefill.name.trim();
      if (pre) {
        const baseSlug = slugify(pre);
        const existing = new Set(
          Object.keys(ctx.existingConfig?.projects ?? {}),
        );
        let slug = baseSlug;
        let n = 2;
        while (existing.has(slug)) slug = `${baseSlug}-${n++}`;
        ctx.results.projectKey = slug;
        ctx.results.projectName = pre;
        return;
      }
    }

    const answer = await text({
      message: "Project name (optional — press Enter to skip):",
      placeholder: "e.g. My Backend",
    });
    guardCancel(answer);

    const name = typeof answer === "string" ? answer.trim() : "";
    if (name) {
      const baseSlug = slugify(name);
      const existing = new Set(Object.keys(ctx.existingConfig?.projects ?? {}));
      let slug = baseSlug;
      let n = 2;
      while (existing.has(slug)) {
        slug = `${baseSlug}-${n++}`;
      }
      ctx.results.projectKey = slug;
      ctx.results.projectName = name;
    } else {
      ctx.results.projectKey = "prj1";
      ctx.results.projectName = undefined;
    }
  },
};
