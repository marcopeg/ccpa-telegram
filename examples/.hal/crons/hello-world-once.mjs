export const enabled = false;
export const runAt = "2026-03-10T14:45:00Z"; // fires once, 5 minutes after creation

export async function handler(ctx) {
  console.log("CRON Hello World (one-shot)");
  await ctx.projects["claude-code"].bot.api.sendMessage(
    7974709349,
    "CRON Hello World (one-shot)",
  );
}
