import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Request/response logging middleware.
 *
 * Assigns each request a correlation id (`req.requestId`, echoed as the
 * `X-Request-Id` response header) and emits one structured JSON line per
 * completed request once the response finishes. Structured logging keeps the
 * output machine-parseable in production while remaining readable in dev.
 *
 * Only request metadata is logged — never bodies, headers, cookies, or query
 * values — so credentials and tokens are never written to logs.
 */

// Augment Express's Request with the per-request correlation id.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/** Log levels in increasing severity, matching the project's logging levels. */
type LogLevel = "debug" | "info" | "warn" | "error";

/** Choose a level from the response status: 5xx → error, 4xx → warn, else info. */
function levelForStatus(status: number): LogLevel {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

/**
 * Express middleware that stamps a request id and logs method, path, status,
 * and duration when the response completes.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Honour an inbound correlation id from an upstream proxy/gateway if present,
  // otherwise mint a fresh one.
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.length > 0
      ? incoming
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const level = levelForStatus(res.statusCode);
    const line = {
      level,
      timestamp: new Date().toISOString(),
      message: "request.completed",
      requestId,
      method: req.method,
      // Strip the query string from the stable original URL so query values
      // (search terms, tokenized links, etc.) never reach application logs,
      // while retaining the full path. `req.path` would be mount-relative here
      // because Express mutates it during routing before `finish` fires.
      path: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.user?.id,
    };

    const serialized = JSON.stringify(line);
    if (level === "error") {
      console.error(serialized);
    } else if (level === "warn") {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  });

  next();
}
