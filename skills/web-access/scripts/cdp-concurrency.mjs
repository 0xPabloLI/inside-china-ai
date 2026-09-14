/**
 * Bounded concurrency for the CDP proxy (#273 P0.2).
 *
 * One proxy process fronts one Chrome. When several pipelines run in parallel
 * (2026-09-12: four `main.mjs` runs at once), each fires a dozen site searches
 * through this single process; the connection and resource load terminated the
 * proxy with SIGTERM and every pipeline lost its CDP-backed sources at once.
 *
 * The scheduler is the guard: a bounded number of browser-backed operations may
 * be in flight, each additional request queues, and a request that cannot be
 * served inside its budget is refused with 503 instead of being pushed into
 * Chrome. A target that is already being driven is busy — a second request for
 * the same tab waits rather than interleaving navigation state with it.
 *
 * Deliberately free of I/O so it can be unit tested without a proxy or Chrome;
 * `cdp-proxy.mjs` wires it into the HTTP handler.
 *
 * @module web-access/cdp-concurrency
 */

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Refusal raised when a request cannot be served inside its budget. The proxy
 * maps `status` onto the HTTP response; clients treat it as "back off and
 * retry", never as "the source is dead".
 */
export class CdpSchedulerError extends Error {
  /**
   * @param {string} code - CDP_PROXY_QUEUE_FULL | CDP_PROXY_QUEUE_TIMEOUT
   * @param {number} status - HTTP status to answer with
   * @param {string} message
   * @param {object} [extra] - targetId / reason surfaced to the client
   */
  constructor(code, status, message, extra = {}) {
    super(message);
    this.name = "CdpSchedulerError";
    this.code = code;
    this.status = status;
    this.reason = extra.reason ?? null;
    this.targetId = extra.targetId ?? null;
  }
}

/**
 * @param {object} [opts]
 * @param {number} [opts.maxConcurrent] - in-flight browser-backed operations
 * @param {number} [opts.maxQueued] - hard cap on waiting requests
 * @param {number} [opts.queueTimeoutMs] - how long a request may wait
 * @returns {object} scheduler
 */
export function createCdpScheduler(opts = {}) {
  const maxConcurrent = opts.maxConcurrent ?? intFromEnv("CDP_PROXY_MAX_CONCURRENCY", 3);
  const maxQueued = opts.maxQueued ?? intFromEnv("CDP_PROXY_MAX_QUEUED", 8);
  const queueTimeoutMs = opts.queueTimeoutMs ?? intFromEnv("CDP_PROXY_QUEUE_TIMEOUT_MS", 30000);

  if (!Number.isFinite(maxConcurrent) || maxConcurrent < 1) {
    throw new Error(`maxConcurrent must be >= 1, got ${maxConcurrent}`);
  }

  /** @type {Set<string>} targetIds with an operation in flight */
  const busy = new Set();
  /** @type {Array<{targetId: string|null, resolve: Function, reject: Function, timer: NodeJS.Timeout}>} */
  const waiting = [];
  let inFlight = 0;

  const stats = () => ({
    inFlight,
    queued: waiting.length,
    busyTargets: [...busy],
    maxConcurrent,
    maxQueued,
    queueTimeoutMs,
  });

  /** Hand the next servable waiter a slot, preserving order where possible. */
  function dispatch() {
    while (inFlight < maxConcurrent && waiting.length > 0) {
      // First waiter whose target is free. Waiters ahead of it whose target is
      // busy cannot proceed anyway, so serving past them starves nobody.
      const idx = waiting.findIndex((w) => !w.targetId || !busy.has(w.targetId));
      if (idx === -1) return;
      const w = waiting.splice(idx, 1)[0];
      clearTimeout(w.timer);
      if (w.targetId) busy.add(w.targetId);
      inFlight++;
      let released = false;
      w.resolve(() => {
        if (released) return;
        released = true;
        inFlight--;
        if (w.targetId) busy.delete(w.targetId);
        dispatch();
      });
    }
  }

  /**
   * Acquire the right to run one browser-backed operation.
   *
   * @param {{targetId?: string|null}} [opts] - a target that is already in use
   *   makes this request wait for it instead of interleaving with it
   * @returns {Promise<() => void>} release — idempotent; wire it to `res.close`
   * @throws {CdpSchedulerError} QUEUE_FULL when the queue is saturated, or
   *   QUEUE_TIMEOUT when the budget expires
   */
  async function acquire({ targetId = null } = {}) {
    if (inFlight < maxConcurrent && (!targetId || !busy.has(targetId))) {
      if (targetId) busy.add(targetId);
      inFlight++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        inFlight--;
        if (targetId) busy.delete(targetId);
        dispatch();
      };
    }

    if (waiting.length >= maxQueued) {
      throw new CdpSchedulerError(
        "CDP_PROXY_QUEUE_FULL",
        503,
        `CDP proxy is saturated: ${inFlight}/${maxConcurrent} in flight, ${waiting.length} queued ` +
          `(cap ${maxQueued})${targetId ? `, target ${targetId} busy` : ""}. Back off and retry — ` +
          `this guard keeps the single Chrome behind the proxy alive (#273).`,
        { reason: "queue-full", targetId },
      );
    }

    return new Promise((resolve, reject) => {
      const entry = { targetId, resolve, reject, timer: null };
      entry.timer = setTimeout(() => {
        const idx = waiting.indexOf(entry);
        if (idx !== -1) waiting.splice(idx, 1);
        const busyNow = targetId ? busy.has(targetId) : false;
        reject(
          new CdpSchedulerError(
            "CDP_PROXY_QUEUE_TIMEOUT",
            503,
            `CDP proxy did not serve this request within ${queueTimeoutMs}ms ` +
              `(${inFlight}/${maxConcurrent} in flight, ${waiting.length} still queued` +
              `${targetId ? `, target ${targetId}${busyNow ? " busy" : " free"}` : ""}). ` +
              `Reduce parallel pipelines or raise CDP_PROXY_MAX_CONCURRENCY (#273).`,
            { reason: busyNow ? "target-busy" : "saturated", targetId },
          ),
        );
      }, queueTimeoutMs);
      waiting.push(entry);
    });
  }

  return { acquire, stats };
}
