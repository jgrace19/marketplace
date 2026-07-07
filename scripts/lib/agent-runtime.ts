import type { Run, RunResult, SDKMessage } from "@cursor/sdk";

export interface RunWithTimeoutResult {
  result: RunResult | null;
  timedOut: boolean;
  timeoutMs?: number;
}

/**
 * Consume a cloud agent run's event stream AND wait for it to finish, all under
 * a single wall-clock deadline. `onEvent` is invoked for every streamed
 * message. If the deadline fires first, the run is cancelled and
 * `{ timedOut: true }` is returned.
 *
 * Why the whole stream (not just `run.wait()`) must be under the deadline:
 * cloud agents can stall mid-stream (the stream stays open but no further
 * events arrive — model stalls, network, missing tooling). The previous
 * implementation consumed the entire `for await (... of run.stream())` loop
 * first and only THEN armed a timeout on `run.wait()`. A hang during streaming
 * therefore never reached the timeout: the `for await` blocked forever and the
 * orchestrator only unblocked when the outer GitHub Actions `timeout-minutes`
 * cancelled the whole job 30+ minutes later. Guarding the stream itself caps a
 * stalled agent at `timeoutMs` and lets the pipeline finish cleanly.
 */
export async function consumeRunWithTimeout(
  run: Run,
  timeoutMs: number,
  onEvent: (event: SDKMessage) => void,
): Promise<RunWithTimeoutResult> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<RunWithTimeoutResult>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({ result: null, timedOut: true, timeoutMs });
    }, timeoutMs);
  });

  const completion = (async (): Promise<RunWithTimeoutResult> => {
    for await (const event of run.stream()) {
      if (timedOut) break;
      onEvent(event);
    }
    const result = await run.wait();
    return { result, timedOut: false };
  })();

  try {
    const winner = await Promise.race<RunWithTimeoutResult>([
      completion,
      timeoutPromise,
    ]);
    if (winner.timedOut) {
      try {
        await run.cancel();
      } catch {
        // Best effort; the run may have already terminated.
      }
      // The abandoned stream/wait promise may still reject later (e.g. because
      // we cancelled it); swallow it so it does not surface as an unhandled
      // rejection and crash the process.
      completion.catch(() => {});
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
