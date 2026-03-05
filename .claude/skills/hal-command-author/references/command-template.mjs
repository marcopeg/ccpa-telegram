/**
 * HAL command skeleton — copy this file to .hal/commands/<name>.mjs and fill in.
 *
 * Required exports:
 *   description  — shown in Telegram's / command menu (≤ 256 chars)
 *   default      — async handler function
 *
 * Return a string to send it as the reply, or null/undefined to suppress.
 */

// import { writeFile } from 'node:fs/promises';   // uncomment if writing files
// import { join } from 'node:path';               // uncomment if building paths
// import { InputFile } from 'grammy';             // uncomment if sending documents

export const description = 'Short description shown in the Telegram command menu';

/**
 * @param {object} opts
 * @param {string[]}          opts.args        — tokens after the command name
 * @param {Record<string,string>} opts.ctx     — resolved context variables
 * @param {import('grammy').Context} opts.gram — raw Grammy context (advanced use)
 * @param {{ call(prompt:string, opts?:object):Promise<string> }} opts.agent
 * @param {{ config: import('../src/config.js').ResolvedProjectConfig }} opts.projectCtx
 */
export default async function handler({ args, ctx, gram, agent, projectCtx }) {
  // ── Arg parsing ────────────────────────────────────────────────────────────
  const target = args[0] ?? 'default';
  // const count = args[0] ? Number.parseInt(args[0], 10) : 10;
  // if (Number.isNaN(count) || count < 1) return 'Usage: /name <positive-integer>';

  // ── Path & time ────────────────────────────────────────────────────────────
  const cwd = ctx['project.cwd'];           // project root — never use process.cwd()
  // const now = Number(ctx['sys.ts']);      // current Unix timestamp (seconds)

  // ── Main logic ─────────────────────────────────────────────────────────────
  const output = `Hello from /name! target=${target}, cwd=${cwd}`;

  // ── Long-output guard (> 3 800 chars → send as file) ──────────────────────
  // if (output.length > 3800) {
  //   const filePath = join(cwd, '.hal', 'tmp', `${ctx['sys.ts']}-output.txt`);
  //   await writeFile(filePath, output, 'utf-8');
  //   await gram.replyWithDocument(new InputFile(filePath));
  //   return null;
  // }

  return output;
}
