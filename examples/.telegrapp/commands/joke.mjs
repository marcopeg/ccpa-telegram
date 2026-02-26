export const description = "Tell a joke (default: chuck norris)";

// Rotating status messages shown while the agent is working
const QUIPS = [
  "🎭 Elucubrating...",
  "📚 Consulting the comedy archives...",
  "🧠 Calibrating the punchline...",
  "😏 Warming up the crowd...",
  "🔬 Analyzing humor molecules...",
  "✨ Polishing the wit...",
  "🎪 Preparing the stage...",
  "🎯 Aiming for maximum chuckles...",
  "🤔 Pondering the existential comedy...",
  "🎲 Rolling the joke dice...",
];

export default async function ({ args, gram, agent }) {
  const topic = args.length > 0 ? args.join(" ") : "chuck norris";

  // Send the initial status message
  const statusMsg = await gram.reply(QUIPS[0]);

  // Cycle through quips every 2s independent of agent progress
  let quipIndex = 0;
  const rotator = setInterval(async () => {
    quipIndex = (quipIndex + 1) % QUIPS.length;
    try {
      await gram.api.editMessageText(
        gram.chat.id,
        statusMsg.message_id,
        QUIPS[quipIndex],
      );
    } catch {
      // Message may have been deleted or edited too fast — ignore
    }
  }, 2000);

  try {
    const joke = await agent.call(
      `Tell a single short, funny joke about ${topic}. ` +
        `Reply with only the joke — no intro, no commentary, no markdown formatting.`,
      {
        // onProgress updates override the rotator when Claude reports tool activity
        onProgress: async (activity) => {
          try {
            await gram.api.editMessageText(
              gram.chat.id,
              statusMsg.message_id,
              `💭 ${activity}`,
            );
          } catch {
            // ignore
          }
        },
      },
    );

    clearInterval(rotator);
    await gram.api.deleteMessage(gram.chat.id, statusMsg.message_id);
    return joke;
  } catch (err) {
    clearInterval(rotator);
    await gram.api.deleteMessage(gram.chat.id, statusMsg.message_id);
    throw err; // re-throw so the bot sends "Command failed: ..."
  }
}
