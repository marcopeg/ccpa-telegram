export const description = "Show context sent to the AI";

export default async function ({ ctx }) {
  const lines = Object.entries(ctx).map(([k, v]) => `${k}: ${v}`);
  return `*Context sent to AI (${lines.length} vars)*\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
}
