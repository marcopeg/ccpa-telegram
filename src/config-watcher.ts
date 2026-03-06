import { join } from "node:path";
import chokidar from "chokidar";

const CONFIG_FILES = [
  "hal.config.json",
  "hal.config.jsonc",
  "hal.config.yaml",
  "hal.config.yml",
  "hal.config.local.json",
  "hal.config.local.jsonc",
  "hal.config.local.yaml",
  "hal.config.local.yml",
  ".env",
  ".env.local",
] as const;

const DEBOUNCE_MS = 400;

export interface ConfigWatcherHandle {
  stop: () => Promise<void>;
}

export interface ConfigWatcherOptions {
  /** Extra paths to watch (e.g. custom env file and its .local sibling). */
  extraPaths?: string[];
}

/**
 * Watch hal config files in configDir (and optional extraPaths) and invoke
 * onConfigChange (debounced) when any are added, changed, or removed.
 * Use ignoreInitial so the initial scan does not trigger the callback.
 */
export function startConfigWatcher(
  configDir: string,
  onConfigChange: () => void | Promise<void>,
  options: ConfigWatcherOptions = {},
): ConfigWatcherHandle {
  const basePaths = CONFIG_FILES.map((f) => join(configDir, f));
  const extraPaths = options.extraPaths ?? [];
  const watchedPaths =
    extraPaths.length > 0 ? [...basePaths, ...extraPaths] : basePaths;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const fire = (): void => {
    if (closed) return;
    debounceTimer = null;
    onConfigChange();
  };

  const schedule = (): void => {
    if (closed) return;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fire, DEBOUNCE_MS);
  };

  const watcher = chokidar.watch(watchedPaths, {
    ignoreInitial: true,
  });

  watcher.on("add", schedule);
  watcher.on("change", schedule);
  watcher.on("unlink", schedule);

  return {
    stop: (): Promise<void> =>
      new Promise((resolve) => {
        closed = true;
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        watcher.close().then(() => resolve());
      }),
  };
}
