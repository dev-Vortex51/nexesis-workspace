import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http";

/**
 * Rate-limiting middleware.
 *
 * The API spec defines the `RATE_LIMITED` (429) error code but does not fix a
 * concrete policy (window length or request ceiling), so those are supplied by
 * the caller — this middleware only enforces whatever limit it is given and
 * shapes the spec's 429 envelope when the limit is exceeded.
 *
 * Strategy: a fixed-window counter kept in process memory, keyed per client
 * (authenticated user id when available, else remote IP). The in-memory store
 * is sufficient for a single instance; a multi-instance deployment would swap
 * the store for a shared backend (e.g. Redis) behind the same interface.
 *
 * On every response it sets the standard rate-limit headers so clients can
 * self-throttle, and adds `Retry-After` when a request is rejected.
 */

export interface RateLimitOptions {
  /** Sliding fixed-window length in milliseconds. */
  windowMs: number;
  /** Maximum number of requests permitted per key within a window. */
  max: number;
  /**
   * Derives the throttling key for a request. Defaults to the authenticated
   * user id, falling back to the remote IP for unauthenticated traffic.
   */
  keyGenerator?: (req: Request) => string;
  /**
   * Hard cap on the number of distinct keys retained in the in-memory store.
   * Bounds memory against key churn (e.g. rotating IPs); once reached, expired
   * entries are swept and, if still full, the oldest-expiring key is evicted
   * before a new one is admitted. Defaults to {@link DEFAULT_MAX_KEYS}.
   */
  maxKeys?: number;
}

interface WindowState {
  count: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
}

/** Default cap on retained keys before eviction kicks in. */
const DEFAULT_MAX_KEYS = 10_000;

/** Default key: prefer the authenticated user, else the request IP. */
function defaultKey(req: Request): string {
  if (req.user?.id) return `user:${req.user.id}`;
  return `ip:${req.ip ?? "unknown"}`;
}

/**
 * Build a rate-limiting middleware for the given policy. Each returned
 * middleware owns its own counter store, so distinct policies (e.g. a stricter
 * auth limiter) do not share buckets.
 */
export function rateLimit(options: RateLimitOptions) {
  const {
    windowMs,
    max,
    keyGenerator = defaultKey,
    maxKeys = DEFAULT_MAX_KEYS,
  } = options;

  // Fail fast on a misconfigured policy rather than silently admitting every
  // request (max ≤ 0) or never resetting a window (windowMs ≤ 0).
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`rateLimit: windowMs must be a positive number, got ${windowMs}`);
  }
  if (!Number.isSafeInteger(max) || max <= 0) {
    throw new Error(`rateLimit: max must be a positive safe integer, got ${max}`);
  }
  if (!Number.isSafeInteger(maxKeys) || maxKeys <= 0) {
    throw new Error(`rateLimit: maxKeys must be a positive safe integer, got ${maxKeys}`);
  }

  const store = new Map<string, WindowState>();

  /**
   * Keep the store bounded: drop every entry whose window has already expired,
   * then — if still at capacity — evict the entry that expires soonest so a new
   * key can be admitted. Expired entries carry no live counter, so removing
   * them never resets an active window.
   */
  function evictIfNeeded(now: number): void {
    if (store.size < maxKeys) return;

    for (const [k, s] of store) {
      if (s.resetAt <= now) store.delete(k);
    }
    if (store.size < maxKeys) return;

    let oldestKey: string | undefined;
    let oldestReset = Infinity;
    for (const [k, s] of store) {
      if (s.resetAt < oldestReset) {
        oldestReset = s.resetAt;
        oldestKey = k;
      }
    }
    if (oldestKey !== undefined) store.delete(oldestKey);
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyGenerator(req);

    let state = store.get(key);
    if (!state || state.resetAt <= now) {
      // Start a fresh window. Bound the store before admitting a new key;
      // expired entries for other keys are swept here and overwritten lazily.
      if (!store.has(key)) evictIfNeeded(now);
      state = { count: 0, resetAt: now + windowMs };
      store.set(key, state);
    }

    state.count += 1;

    const remaining = Math.max(0, max - state.count);
    const resetSeconds = Math.ceil(state.resetAt / 1000);
    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", resetSeconds);

    if (state.count > max) {
      const retryAfter = Math.max(0, Math.ceil((state.resetAt - now) / 1000));
      res.setHeader("Retry-After", retryAfter);
      sendError(res, 429, "RATE_LIMITED", "Too many requests");
      return;
    }

    next();
  };
}
