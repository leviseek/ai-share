export class MonitorError extends Error {
  readonly handlerName: string;

  constructor(handlerName: string, message: string, cause?: unknown) {
    super(message);
    this.name = "MonitorError";
    this.handlerName = handlerName;
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export async function runSafe<T>(handlerName: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[omo-monitor] Error in ${handlerName}: ${message}`);
    return undefined;
  }
}
