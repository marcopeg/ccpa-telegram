import { execSync } from "node:child_process";

/**
 * Returns true if the given CLI command is available (runs `command --version`).
 * Fast check only; does not run any heavy or network operation.
 */
export function isCliAvailable(command: string): boolean {
  try {
    execSync(`${command} --version`, {
      stdio: "pipe",
      timeout: 3000,
      encoding: "utf-8",
    });
    return true;
  } catch {
    return false;
  }
}
