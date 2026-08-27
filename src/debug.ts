const logs: DebugLog[] = [];
export const debugLogs = logs;

export type DebugLogLevel = "log" | "warn" | "error" | "info";

export interface DebugLog {
  time: string;
  level: DebugLogLevel;
  message: string;
}

const maxLogs = 200;

export function addDebugLog(level: DebugLogLevel, ...args: any[]) {
  const msg = args
    .map((a) => (typeof a === "string" ? a : typeof a === "object" ? JSON.stringify(a) : String(a)))
    .join(" ");
  logs.push({
    time: new Date().toLocaleTimeString(),
    level,
    message: msg,
  });
  while (logs.length > maxLogs) logs.shift();
}

export function clearDebugLogs() {
  logs.length = 0;
}

export function installDebugInterceptor() {
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  const origInfo = console.info;

  console.log = (...args: any[]) => {
    addDebugLog("log", ...args);
    origLog.apply(console, args);
  };
  console.warn = (...args: any[]) => {
    addDebugLog("warn", ...args);
    origWarn.apply(console, args);
  };
  console.error = (...args: any[]) => {
    addDebugLog("error", ...args);
    origError.apply(console, args);
  };
  console.info = (...args: any[]) => {
    addDebugLog("info", ...args);
    origInfo.apply(console, args);
  };
}
