import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, sendError, ValidationError } from "../lib/http";
import type { ApiErrorDetail } from "../../shared/types/api";

/**
 * Central error-handling middleware for the API.
 *
 * Individual routes may catch and shape their own errors, but this pair of
 * handlers is the safety net that guarantees every unmatched route and every
 * uncaught error still leaves the server as the standard response envelope
 * defined in `05-api-spec.md` — never a raw Express HTML error page.
 *
 *   - `notFoundHandler`  — terminal 404 for any route that matched nothing.
 *   - `errorHandler`     — Express error middleware (4-arg signature) mapping
 *                          known error types to their spec status/code and any
 *                          unknown error to a generic 500 that leaks nothing.
 *
 * Mount order in `server/index.ts`: all routes first, then `notFoundHandler`,
 * then `errorHandler` last.
 */

/** Terminal handler for requests that matched no route → 404 NOT_FOUND. */
export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 404, "NOT_FOUND", "Resource not found");
}

/**
 * Express error middleware. Must keep the 4-argument signature so Express
 * recognises it as an error handler and routes thrown/`next(err)` errors here.
 *
 * Mapping:
 *   - ZodError        → 400 VALIDATION_ERROR with field-level details.
 *   - ValidationError → its status/code, forwarding any attached details.
 *   - AppError        → its declared status/code (401/403/404/409/…).
 *   - anything else   → 500 INTERNAL_ERROR, logged with context; no internal
 *                       detail or stack trace is exposed to the client.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // `next` is required for Express to treat this as an error handler, even
  // though a terminal handler never delegates further.
  _next: NextFunction,
): void {
  // If a handler already started the response, delegate to Express's default
  // finalizer — we cannot rewrite headers/body at this point.
  if (res.headersSent) {
    _next(err);
    return;
  }

  if (err instanceof ZodError) {
    const details: ApiErrorDetail[] = err.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    sendError(res, 400, "VALIDATION_ERROR", "Invalid input", details);
    return;
  }

  if (err instanceof AppError) {
    const details =
      err instanceof ValidationError ? err.details : undefined;
    sendError(res, err.status, err.code, err.message, details);
    return;
  }

  // Unknown/unexpected error: log with request context for diagnosis, but
  // return a generic message so internals and stack traces never reach clients.
  console.error(
    JSON.stringify({
      level: "error",
      message: "Unhandled API error",
      method: req.method,
      path: req.originalUrl,
      requestId: req.requestId,
      userId: req.user?.id,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}
