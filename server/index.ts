import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import authRoutes from "./routes/auth";
import { requestLogger } from "./middleware/request-logger";
import { rateLimit } from "./middleware/rate-limit";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";

/**
 * Express API server entry point.
 *
 * Middleware order matters:
 *   1. `requestLogger` first, so every request (auth included) gets a
 *      correlation id and a completion log line.
 *   2. Better Auth catch-all, mounted BEFORE `express.json()` because Better
 *      Auth reads the raw request stream.
 *   3. `express.json()` for the application's own JSON routes.
 *   4. Public health check (unauthenticated, unthrottled).
 *   5. Rate limiting scoped to the `/api/v1` application surface.
 *   6. Application routes under the `/api/v1` base path from the API spec.
 *   7. `notFoundHandler` then `errorHandler` last, so unmatched routes and any
 *      uncaught error still return the standard response envelope.
 */

// Rate-limit policy. The API spec defines the RATE_LIMITED (429) code but no
// concrete numbers; these defaults are deliberately generous and can be tuned
// (or overridden per-route) without changing the envelope contract.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 300;

export function createServer() {
  const app = express();

  // Trust the reverse proxy so `req.ip` reflects the real client behind
  // Railway/Vercel, keeping IP-based rate-limit keys accurate.
  app.set("trust proxy", true);

  // Structured request/response logging + correlation id for all requests.
  app.use(requestLogger);

  // Better Auth internal endpoints (session, token, JWKS, etc.).
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // JSON body parsing for all subsequent application routes.
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" }, error: null });
  });

  // Throttle the application API surface (health check above is exempt).
  app.use(
    "/api/v1",
    rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }),
  );

  app.use("/api/v1/auth", authRoutes);

  // Terminal handlers: unmatched route → 404 envelope; anything thrown →
  // mapped error envelope. Must be registered after all routes.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Start the server when run directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 4000;
  createServer().listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}
