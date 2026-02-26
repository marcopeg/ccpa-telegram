import type { Context, NextFunction } from "grammy";
import type { ProjectContext } from "../../types.js";

/**
 * Returns a middleware that checks if the user is in the project's whitelist.
 */
export function createAuthMiddleware(ctx: ProjectContext) {
  return async (gramCtx: Context, next: NextFunction): Promise<void> => {
    const { allowedUserIds } = ctx.config.access;
    const userId = gramCtx.from?.id;

    // Allow if no whitelist is configured (open access)
    if (allowedUserIds.length === 0) {
      await next();
      return;
    }

    // Check if user is in whitelist
    if (userId && allowedUserIds.includes(userId)) {
      await next();
      return;
    }

    // User not authorized
    await gramCtx.reply(
      "Sorry, you are not authorized to use this bot.\n" +
        "Contact the administrator to request access.",
    );
  };
}
