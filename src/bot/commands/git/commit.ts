import type { Context } from "grammy";
import { createAgent } from "../../../agent/index.js";
import type { ProjectContext } from "../../../types.js";
import { gitExec } from "./exec.js";

const COMMIT_MSG_PROMPT = `Generate a concise git commit message (one line, max 72 chars) for the following changes. Return ONLY the commit message, no quotes or explanation.

`;

export function createGitCommitHandler(ctx: ProjectContext) {
  return async (gramCtx: Context): Promise<void> => {
    const { config, logger } = ctx;
    const cwd = config.cwd;
    const messageText = gramCtx.message?.text ?? "";
    const userMessage = messageText.replace(/^\/git_commit\s*/, "").trim();

    try {
      await gitExec(cwd, ["add", "."]);

      const { stdout: statusOut } = await gitExec(cwd, [
        "status",
        "--porcelain",
      ]);
      if (!statusOut.trim()) {
        await gramCtx.reply("Nothing to commit — working tree is clean.");
        return;
      }

      let commitMessage: string;

      if (userMessage) {
        commitMessage = userMessage;
      } else {
        const statusMsg = await gramCtx.reply(
          "_Generating commit message..._",
          { parse_mode: "Markdown" },
        );

        try {
          const { stdout: diffOut } = await gitExec(cwd, [
            "diff",
            "--cached",
            "--stat",
          ]);
          const agent = createAgent(ctx);
          const generated = await agent.call(
            `${COMMIT_MSG_PROMPT}${diffOut || statusOut}`,
          );
          commitMessage = generated.trim().replace(/^["']|["']$/g, "");

          try {
            await gramCtx.api.deleteMessage(
              gramCtx.chat!.id,
              statusMsg.message_id,
            );
          } catch {
            // ignore delete errors
          }
        } catch (err) {
          try {
            await gramCtx.api.deleteMessage(
              gramCtx.chat!.id,
              statusMsg.message_id,
            );
          } catch {
            // ignore delete errors
          }
          logger.error(
            { error: err instanceof Error ? err.message : String(err) },
            "AI commit message generation failed",
          );
          await gramCtx.reply(
            "Failed to generate commit message. Please provide one:\n`/git_commit your message here`",
            { parse_mode: "Markdown" },
          );
          return;
        }
      }

      const { stdout: commitOut } = await gitExec(cwd, [
        "commit",
        "-m",
        commitMessage,
      ]);

      const summary = commitOut.trim().split("\n")[0] ?? "Committed.";
      await gramCtx.reply(`\`\`\`\n${summary}\n\`\`\``, {
        parse_mode: "Markdown",
      });
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "/git_commit failed",
      );
      await gramCtx.reply(
        `Commit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
