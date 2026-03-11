// Project-tier programmatic cron example.
//
// Fires every Friday at 17:00 and sends a weekly git activity summary
// to a specific Telegram user.
//
// ctx.project  — full resolved project config
// ctx.bot      — Grammy Bot for this project
// ctx.context  — resolved context vars (same map as .md prompt injection)
// ctx.call()   — call this project's AI engine

export const enabled = true;
// export const schedule = "*/5 * * * * *"; // every 5 seconds
export const schedule = "1s"; // every 5 seconds
export const scheduleStarts = "5s"; // stop after 10 seconds (for testing purposes)
export const scheduleEnds = "10s"; // stop after 10 seconds (for testing purposes)
export const runAs = "7974709349"; // specify the project this cron belongs to (optional, defaults to current project)

/**
 * @param {import('@marcopeg/hal').ProjectCronContext} ctx
 */
export async function handler(ctx) {
  console.log('Hello from project-tier cron!');
  console.log(JSON.stringify(ctx.context, null, 2));
}
