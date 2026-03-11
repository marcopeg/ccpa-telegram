import { z } from "zod";

// ─── System-tier schema ───────────────────────────────────────────────────────

export const CronTargetSchema = z.object({
  projectId: z.string().min(1),
  userId: z.number().int().optional(),
  flowResult: z.boolean().optional(),
});

export const MdFrontmatterSchema = z
  .object({
    enabled: z.boolean().default(false),
    schedule: z.string().optional(),
    runAt: z.string().optional(),
    scheduleStarts: z.string().optional(),
    scheduleEnds: z.string().optional(),
    targets: z.array(CronTargetSchema).min(1),
  })
  .refine((data) => !!(data.schedule || data.runAt), {
    message: "Exactly one of schedule or runAt is required",
  })
  .refine((data) => !(data.schedule && data.runAt), {
    message: "Only one of schedule or runAt may be set",
  });

export type MdFrontmatter = z.infer<typeof MdFrontmatterSchema>;

// ─── Project-tier schema ──────────────────────────────────────────────────────

export const ProjectMdFrontmatterSchema = z
  .object({
    enabled: z.boolean().default(false),
    schedule: z.string().optional(),
    runAt: z.string().optional(),
    scheduleStarts: z.string().optional(),
    scheduleEnds: z.string().optional(),
    /** User ID for context injection AND primary DM recipient. Coerced — accepts "123" or 123. */
    runAs: z.coerce.number().int().optional(),
    /** Additional DM recipients (no context injection). Coerced — accepts string or number. */
    notify: z.array(z.coerce.number().int()).optional(),
  })
  .refine((data) => !!(data.schedule || data.runAt), {
    message: "Exactly one of schedule or runAt is required",
  })
  .refine((data) => !(data.schedule && data.runAt), {
    message: "Only one of schedule or runAt may be set",
  });

export type ProjectMdFrontmatter = z.infer<typeof ProjectMdFrontmatterSchema>;
