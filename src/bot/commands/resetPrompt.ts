import type { Api } from "grammy";

interface ActivePrompt {
  chatId: number;
  messageId: number;
  timer: ReturnType<typeof setTimeout>;
}

const activePrompts = new Map<number, ActivePrompt>();

/**
 * Track a new reset confirmation prompt for a user.
 * Starts a timeout that auto-removes the inline keyboard on expiry.
 */
export function trackPrompt(
  userId: number,
  chatId: number,
  messageId: number,
  timeoutMs: number,
  api: Api,
): void {
  const timer = setTimeout(async () => {
    activePrompts.delete(userId);
    try {
      await api.editMessageReplyMarkup(chatId, messageId, {
        reply_markup: undefined,
      });
    } catch {
      // Message may already be edited or deleted — ignore
    }
  }, timeoutMs);

  activePrompts.set(userId, { chatId, messageId, timer });
}

/**
 * Invalidate a previous active prompt for a user (e.g. when /reset is sent again).
 * Cancels the timer and edits the message to remove buttons.
 */
export async function invalidatePrompt(
  userId: number,
  api: Api,
): Promise<void> {
  const entry = activePrompts.get(userId);
  if (!entry) return;

  clearTimeout(entry.timer);
  activePrompts.delete(userId);

  try {
    await api.editMessageReplyMarkup(entry.chatId, entry.messageId, {
      reply_markup: undefined,
    });
  } catch {
    // Message may already be edited or deleted — ignore
  }
}

/**
 * Resolve (clean up) a prompt after the user has tapped confirm or abort.
 */
export function resolvePrompt(userId: number): void {
  const entry = activePrompts.get(userId);
  if (!entry) return;
  clearTimeout(entry.timer);
  activePrompts.delete(userId);
}

/**
 * Cancel all active prompt timers. Call on bot shutdown.
 */
export function clearAllPrompts(): void {
  for (const entry of activePrompts.values()) {
    clearTimeout(entry.timer);
  }
  activePrompts.clear();
}
