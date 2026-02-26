import type { Context, NextFunction } from "grammy";
import type { ProjectContext } from "../../types.js";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Returns a per-bot rate limit middleware and a cleanup function.
 * Each bot gets its own in-memory store — no cross-bot state.
 */
export function createRateLimitMiddleware(ctx: ProjectContext): {
  middleware: (gramCtx: Context, next: NextFunction) => Promise<void>;
  cleanup: () => void;
} {
  const { max, windowMs } = ctx.config.rateLimit;
  const store = new Map<number, RateLimitEntry>();

  const interval = setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of store) {
      if (now - entry.windowStart > windowMs) {
        store.delete(userId);
      }
    }
  }, 60000);

  // Prevent the interval from keeping the process alive
  if (interval.unref) interval.unref();

  const middleware = async (
    gramCtx: Context,
    next: NextFunction,
  ): Promise<void> => {
    const userId = gramCtx.from?.id;

    if (!userId) {
      await next();
      return;
    }

    const now = Date.now();
    const entry = store.get(userId);

    if (entry) {
      if (now - entry.windowStart > windowMs) {
        // Reset window
        store.set(userId, { count: 1, windowStart: now });
        await next();
        return;
      }

      if (entry.count >= max) {
        const remainingMs = windowMs - (now - entry.windowStart);
        const remainingSec = Math.ceil(remainingMs / 1000);
        await gramCtx.reply(
          `Rate limit exceeded. Please wait ${remainingSec} seconds before sending another message.`,
        );
        return;
      }

      entry.count++;
    } else {
      store.set(userId, { count: 1, windowStart: now });
    }

    await next();
  };

  return { middleware, cleanup: () => clearInterval(interval) };
}
