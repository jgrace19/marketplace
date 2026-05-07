import type { Run, RunResult } from "@cursor/sdk";

export interface RunWithTimeoutResult {
  result: RunResult | null;
  timedOut: boolean;
  timeoutMs?: number;
}

/**
 * Wait for a cloud agent run to finish, but cancel it if it exceeds
 * `timeoutMs`. Cloud agents can hang for unobservable reasons (network, model
 * stalls, missing tooling); without this the orchestrator would block until the
 * outer GitHub Actions `timeout-minutes` kicks in 30+ minutes later.
 */
export async function waitForRunWithTimeout(
  run: Run,
  timeoutMs: number,
): Promise<RunWithTimeoutResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<RunWithTimeoutResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ result: null, timedOut: true, timeoutMs });
    }, timeoutMs);
  });

  try {
    const winner = await Promise.race<RunWithTimeoutResult>([
      run.wait().then((result) => ({ result, timedOut: false })),
      timeoutPromise,
    ]);
    if (winner.timedOut) {
      try {
        await run.cancel();
      } catch {
        // Best effort; the run may have already terminated.
      }
    }
    return winner;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface HeartbeatOptions {
  label: string;
  intervalMs?: number;
}

/**
 * Logs a heartbeat line whenever the stream has been silent for `intervalMs`.
 * Returns a `tick()` callback to call on every observed event, and a `stop()`
 * callback to call when the stream ends. This lets us spot a hung agent in the
 * logs without waiting for the full timeout.
 */
export function startStreamHeartbeat(opts: HeartbeatOptions): {
  tick: () => void;
  stop: () => void;
} {
  const intervalMs = opts.intervalMs ?? 30_000;
  let lastEvent = Date.now();
  const interval = setInterval(() => {
    const silentMs = Date.now() - lastEvent;
    if (silentMs >= intervalMs) {
      console.log(
        `[${opts.label}] alive (${Math.round(silentMs / 1000)}s since last event)`,
      );
    }
  }, intervalMs);
  return {
    tick: () => {
      lastEvent = Date.now();
    },
    stop: () => clearInterval(interval),
  };
}
