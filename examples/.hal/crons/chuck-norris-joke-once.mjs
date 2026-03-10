export const enabled = true;
export const runAt = "2026-03-10T15:50:00Z"; // fires once, 5 minutes after creation

export async function handler(ctx) {
  const [slug, project] = Object.entries(ctx.projects)[0];
  if (!project) {
    console.log("[chuck-norris-joke-once] No projects available — skipping.");
    return;
  }

  const joke = await project.call(
    "Tell me one Chuck Norris joke about this project. Just the joke, no intro, no commentary.",
  );

  console.log(`[chuck-norris-joke-once] (${slug})\n${joke}`);
}
