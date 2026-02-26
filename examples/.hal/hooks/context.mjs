// Global context hook — runs for every project, every message.
// Receives the fully-resolved context and returns the (optionally modified) context.
// This file is hot-reloaded on every message — edits take effect immediately.

export default async (context) => ({
  ...context,
  app: "ccpa-telegram",
})
