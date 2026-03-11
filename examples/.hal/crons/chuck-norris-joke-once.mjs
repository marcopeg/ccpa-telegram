export const enabled = false;
export const schedule = "!5m"; // fires once 5 minutes after the file is loaded

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
