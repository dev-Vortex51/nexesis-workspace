import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@/server/websocket/events/contract";

/**
 * Typed Socket.IO client for the Express real-time server.
 *
 * Counterpart to `lib/api-client.ts`: where that speaks the HTTP envelope, this
 * opens the Socket.IO connection defined in `05-api-spec.md` → "WebSocket
 * Events". The socket is typed with the same event contract the server uses, so
 * both ends agree on event names and payload shapes.
 *
 * Authentication reuses the Better Auth session: the connection is credentialed
 * (`withCredentials`) so the httpOnly session cookie rides the handshake, and an
 * explicit token may be supplied for non-browser clients. The server validates
 * the handshake before the connection is accepted.
 */

/** The app's typed client socket. */
export type AppClientSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

/** Base URL for the Socket.IO server; defaults to the API origin. */
const DEFAULT_SOCKET_URL = "http://localhost:3000";

/**
 * Reduce a URL to just its origin (scheme + host + port), dropping any path.
 *
 * `NEXT_PUBLIC_API_URL` follows the API-client convention of including the HTTP
 * base path (e.g. `https://host/api/v1`). Socket.IO interprets a path in the
 * URL passed to `io()` as a namespace, but the server only registers the
 * default namespace — so the raw API URL would silently fail to connect. When
 * deriving the socket URL from the API URL we therefore keep only the origin.
 * Falls back to the raw value if it can't be parsed as an absolute URL.
 */
export function toOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/**
 * Resolve the Socket.IO server URL. Precedence: explicit option →
 * `NEXT_PUBLIC_SOCKET_URL` → origin of `NEXT_PUBLIC_API_URL` → localhost
 * default. Exported for testing.
 */
export function resolveSocketUrl(explicit?: string): string {
  // An explicit URL (option or NEXT_PUBLIC_SOCKET_URL) is intentional and used
  // verbatim — the caller may deliberately target a namespace/path.
  if (explicit) return explicit;
  const socketEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_SOCKET_URL
      : undefined;
  if (socketEnv) return socketEnv;

  // Fall back to the API URL, but strip its `/api/v1` base path to the origin
  // so Socket.IO doesn't treat the path as a namespace.
  const apiEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  if (apiEnv) return toOrigin(apiEnv);

  return DEFAULT_SOCKET_URL;
}

export interface SocketClientOptions {
  /** Override the server URL (defaults to `NEXT_PUBLIC_SOCKET_URL`/API origin). */
  url?: string;
  /**
   * Explicit handshake token for clients that can't send the session cookie.
   * Browser clients can omit this and rely on the credentialed cookie.
   */
  token?: string;
  /** Connect immediately (default) or defer until `.connect()` is called. */
  autoConnect?: boolean;
}

/**
 * Create a typed, unconnected-or-connected Socket.IO client against the app's
 * real-time server. The caller owns the returned socket's lifecycle and is
 * responsible for calling `.disconnect()` when done.
 */
export function createSocketClient(
  options: SocketClientOptions = {},
): AppClientSocket {
  const url = resolveSocketUrl(options.url);

  return io(url, {
    // Send the httpOnly Better Auth session cookie with the handshake.
    withCredentials: true,
    autoConnect: options.autoConnect ?? true,
    // Forwarded to the server handshake; used when no cookie is available.
    auth: options.token ? { token: options.token } : undefined,
  });
}
