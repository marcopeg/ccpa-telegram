export const description = "Show project status";

export default async function ({ args, ctx, projectCtx }) {
  const { config } = projectCtx;
  return `Project: ${config.name ?? config.slug}\nDirectory: ${config.cwd}`;
}
