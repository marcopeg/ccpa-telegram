import { join } from "node:path";
import chokidar from "chokidar";

const CONFIG_FILES = [
  "hal.config.json",
  "hal.config.local.json",
  ".env",
  ".env.local",
] as const;

const DEBOUNCE_MS = 400;

export interface ConfigWatcherHandle {
  stop: () => Promise<void>;
}

/**
 * Watch the four hal config files in configDir and invoke onConfigChange
 * (debounced) when any of them are added, changed, or removed.
 * Use ignoreInitial so the initial scan does not trigger the callback.
 */
export function startConfigWatcher(
  configDir: string,
  onConfigChange: () => void | Promise<void>,
): ConfigWatcherHandle {
  const watchedPaths = CONFIG_FILES.map((f) => join(configDir, f));
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
