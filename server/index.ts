import { createServer as createHttpServer } from "node:http";
import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import authRoutes from "./routes/auth";
import institutionRoutes from "./routes/institutions";
import departmentRoutes from "./routes/departments";
import { attachUser } from "./middleware/auth";
import { requestLogger } from "./middleware/request-logger";
import { rateLimit } from "./middleware/rate-limit";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { createSocketServer } from "./websocket";

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
 *   5. Best-effort `attachUser` then rate limiting, scoped to `/api/v1` — the
 *      session is resolved first so authenticated callers are throttled per
 *      user, not per shared IP.
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
  // `attachUser` runs first so an authenticated caller is keyed by user id
  // rather than a shared NAT/proxy IP — otherwise unrelated users behind one
  // IP would drain (and 429) each other's bucket.
  app.use(
    "/api/v1",
    attachUser,
    rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }),
  );

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/institutions", institutionRoutes);
  app.use("/api/v1/departments", departmentRoutes);

  // Terminal handlers: unmatched route → 404 envelope; anything thrown →
  // mapped error envelope. Must be registered after all routes.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Start the server when run directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 4000;

  // Wrap the Express app in an explicit HTTP server so the Socket.IO real-time
  // layer can share the same listener/port as the HTTP API (per the API spec's
  // WebSocket section — clients connect to the same origin).
  const httpServer = createHttpServer(createServer());
  createSocketServer(httpServer);

  httpServer.listen(port, () => {
    console.log(`API + WebSocket server listening on http://localhost:${port}`);
  });
}
