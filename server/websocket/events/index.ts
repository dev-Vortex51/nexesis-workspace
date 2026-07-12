import type { Server, Socket } from "socket.io";
import {
  CLIENT_EVENTS,
  rooms,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
  type UserTypingPayload,
} from "./contract";

/**
 * Per-connection event wiring.
 *
 * Runs once for every authenticated socket. The socket's principal was
 * resolved and stashed on `socket.data.user` by the handshake auth middleware
 * (see `../index.ts`), so room membership and the typing relay can trust it
 * without re-reading the session.
 */

type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/**
 * Join the rooms every authenticated socket belongs to on connect. Both are
 * derived from the authenticated principal — no client input is trusted:
 *   - `user:{userId}`             — personal notifications
 *   - `institution:{institutionId}` — institution-wide announcements
 *
 * The `project:{projectId}` room is per-project and is joined lazily when the
 * socket first interacts with a project (see the typing handler), since the
 * spec defines no standalone project-join event.
 */
function joinBaseRooms(socket: AppSocket): void {
  const { id: userId, institutionId } = socket.data.user;
  socket.join(rooms.user(userId));
  socket.join(rooms.institution(institutionId));
}

/**
 * Relay a `user:typing` indicator to the rest of a project room.
 *
 * The typing event is the only project-scoped client→server event in the spec,
 * so it doubles as the point where a participant's socket joins that project
 * room (idempotent). The socket is authoritative for `userId` — the value is
 * taken from the authenticated principal, never from the client payload, so a
 * client cannot spoof another user's typing state.
 */
function handleUserTyping(socket: AppSocket, payload: UserTypingPayload): void {
  // Ignore malformed payloads rather than throwing across the socket boundary.
  if (!payload || typeof payload.projectId !== "string") return;

  const room = rooms.project(payload.projectId);
  socket.join(room);

  socket.to(room).emit(CLIENT_EVENTS.USER_TYPING, {
    projectId: payload.projectId,
    userId: socket.data.user.id,
  });
}

/**
 * Register all handlers for a freshly connected, authenticated socket. Called
 * from the server's `connection` listener.
 */
export function registerSocketHandlers(
  _io: AppServer,
  socket: AppSocket,
): void {
  joinBaseRooms(socket);

  socket.on(CLIENT_EVENTS.USER_TYPING, (payload) =>
    handleUserTyping(socket, payload),
  );
}
