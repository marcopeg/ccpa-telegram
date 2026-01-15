import pino from "pino";

let loggerInstance: pino.Logger | null = null;

export function initLogger(level: string = "info"): pino.Logger {
  loggerInstance = pino({ level });
  return loggerInstance;
}

export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    loggerInstance = pino({ level: "info" });
  }
  return loggerInstance;
}
