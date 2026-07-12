import type { Server as HttpServer } from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import { Server, type Socket } from "socket.io";
import { fromNodeHeaders } from "better-auth/node";
import { getCookies } from "better-auth/cookies";
import { auth } from "../auth";
import type { SessionUser } from "../../shared/schemas/auth";
import { registerSocketHandlers } from "./events";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events/contract";

/**
 * Socket.IO server foundation.
 *
 * Implements the real-time surface from `05-api-spec.md` → "WebSocket Events":
 *   - Initializes the Socket.IO server on the shared HTTP listener.
 *   - Authenticates every connection during the handshake, reusing the exact
 *     Better Auth session validation used by the HTTP API — so a socket cannot
 *     connect without a valid session/token.
 *   - Delegates room joins and event handling to `./events`.
 *
 * Domain events (`notification:new`, `message:new`, …) are emitted by the
 * feature units that own those flows; this unit only stands up the transport,
 * authentication, rooms, and handler structure.
 */

/**
 * Fully-typed Socket.IO server for this app. Re-exported so emit call sites in
 * later units get the spec's event map and room-scoped `SocketData`.
 */
export type AppIoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// Heartbeat tuning. Socket.IO's engine sends a ping every `pingInterval` and
// considers the connection dead if no pong arrives within `pingTimeout`. These
// are the library defaults, set explicitly so the heartbeat contract is visible
// and adjustable in one place rather than left implicit.
const PING_INTERVAL_MS = 25_000;
const PING_TIMEOUT_MS = 20_000;

/**
 * The exact name of Better Auth's session-token cookie (honours secure/host
 * prefixes derived from the auth config). A handshake `auth.token` carries just
 * the token value, so it must be wrapped as `<name>=<value>` before
 * `auth.api.getSession` — which parses a Cookie header — can resolve it.
 */
const SESSION_COOKIE_NAME = getCookies(auth.options).sessionToken.name;

/** The single browser origin permitted to open a socket (app front-end). */
const ALLOWED_ORIGIN = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Gate the raw handshake request by Origin. This runs for EVERY transport,
 * including the WebSocket upgrade — unlike the `cors` option, which only
 * governs polling/XHR. Browser clients always send an `Origin` header, so any
 * present origin must match the configured app origin. Requests with no
 * `Origin` (non-browser clients using the token handshake path) are allowed
 * through to the session-auth gate, which still rejects them without a valid
 * token — so this narrows browser access without locking out server-to-server
 * or native clients.
 */
function isRequestOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser client — defer to auth gate
  return origin === ALLOWED_ORIGIN;
}

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Resolve the authenticated principal for a handshake, or `null` when the
 * connection carries no valid session.
 *
 * The client authenticates via the connection handshake (per the spec): the
 * Better Auth session travels either as the httpOnly session cookie (sent when
 * the client connects with credentials) or as a token supplied in
 * `handshake.auth.token`. A supplied token is the session-token value, so it is
 * wrapped into the named session cookie (`<name>=<value>`) before validation;
 * a value that already looks like a full cookie header (contains `=`) is passed
 * through unchanged so existing callers keep working. Validation goes through
 * the same `auth.api.getSession` path as every HTTP request, so the socket and
 * API layers can never disagree about who a caller is.
 */
async function resolveHandshakeUser(
  socket: AppSocket,
): Promise<SessionUser | null> {
  const headers: IncomingHttpHeaders = { ...socket.handshake.headers };

  // Allow an explicit handshake token to stand in for the session cookie. The
  // token is the bare session-token value, so wrap it as the named Better Auth
  // cookie; tolerate a value that is already a `name=value` cookie header.
  const token = socket.handshake.auth?.token;
  if (typeof token === "string" && token.length > 0 && !headers.cookie) {
    headers.cookie = token.includes("=")
      ? token
      : `${SESSION_COOKIE_NAME}=${token}`;
  }

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    role: SessionUser["role"];
    institutionId: string;
    departmentId: string | null;
  };

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    departmentId: user.departmentId ?? null,
  };
}

/**
 * Handshake authentication middleware. Rejects the connection unless a valid
 * session resolves, and stashes the principal on `socket.data.user` for the
 * connection handlers. A rejected handshake never reaches the `connection`
 * event, so no room is ever joined by an unauthenticated socket.
 */
async function authenticateHandshake(
  socket: AppSocket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const user = await resolveHandshakeUser(socket);
    if (!user) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    socket.data.user = user;
    next();
  } catch (error) {
    console.error("Socket handshake authentication failed:", error);
    next(new Error("UNAUTHORIZED"));
  }
}

/**
 * Create and attach the Socket.IO server to an existing HTTP server, wiring up
 * handshake authentication, heartbeat, and per-connection handlers. Returns the
 * typed `Server` so callers can emit domain events into rooms.
 */
export function createSocketServer(httpServer: HttpServer): AppIoServer {
  const io: AppIoServer = new Server(httpServer, {
    // Cookie-based auth requires credentialed CORS from the app origin. `cors`
    // covers the polling transport; `allowRequest` below additionally enforces
    // the origin on the WebSocket upgrade, which CORS does not police.
    cors: {
      origin: ALLOWED_ORIGIN,
      credentials: true,
    },
    // Reject cross-origin browser handshakes across ALL transports (upgrade +
    // polling). Non-browser clients (no Origin) fall through to the auth gate.
    allowRequest: (req, callback) => {
      callback(null, isRequestOriginAllowed(req.headers.origin));
    },
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
  });

  // Authenticate before any connection is accepted.
  io.use((socket, next) => {
    void authenticateHandshake(socket, next);
  });

  io.on("connection", (socket) => {
    registerSocketHandlers(io, socket);
  });

  return io;
}
