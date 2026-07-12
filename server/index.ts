import express from "express";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./auth";
import authRoutes from "./routes/auth";

/**
 * Express API server entry point.
 *
 * The Better Auth catch-all handler is mounted BEFORE `express.json()` (Better
 * Auth reads the raw request stream). The application's own JSON routes are
 * mounted afterward under the /api/v1 base path from the API spec.
 */
export function createServer() {
  const app = express();

  // Better Auth internal endpoints (session, token, JWKS, etc.).
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // JSON body parsing for all subsequent application routes.
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ success: true, data: { status: "ok" }, error: null });
  });

  app.use("/api/v1/auth", authRoutes);

  return app;
}

// Start the server when run directly.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 4000;
  createServer().listen(port, () => {
    console.log(`API server listening on http://localhost:${port}`);
  });
}
