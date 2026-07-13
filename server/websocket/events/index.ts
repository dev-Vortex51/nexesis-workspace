import type { Server, Socket } from "socket.io";
import { prisma } from "../../lib/prisma";
import {
  CLIENT_EVENTS,
  rooms,
  type ClientToServerEvents,
  type InterServerEvents,
  type ProjectSubscriptionPayload,
  type ServerToClientEvents,
  type SocketData,
  type SubscriptionAck,
  type UserTypingPayload,
} from "./contract";
import type { SessionUser } from "../../../shared/schemas/auth";

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
 * The `project:{projectId}` room is per-project and is joined explicitly via
 * the `project:subscribe` event (see `handleProjectSubscribe`) once the socket
 * is authorized for that project — independent of whether the user ever types.
 */
function joinBaseRooms(socket: AppSocket): void {
  const { id: userId, institutionId } = socket.data.user;
  socket.join(rooms.user(userId));
  socket.join(rooms.institution(institutionId));
}

/**
 * Minimal Prisma surface `canAccessProject` needs. Declared structurally so the
 * check can be unit-tested with a light mock instead of a full PrismaClient.
 */
export interface ProjectAccessDb {
  project: {
    findUnique: (args: {
      where: { id: string };
      select: { institutionId: true; studentId: true };
    }) => Promise<{ institutionId: string; studentId: string } | null>;
  };
  projectMember: {
    findFirst: (args: {
      where: { projectId: string; userId: string };
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
}

/**
 * Authorize a socket's principal to join a project room, mirroring the project
 * visibility rules in `05-api-spec.md` → GET /projects ("Response varies by
 * role"):
 *   - Student:     own project only (`project.studentId === user.id`)
 *   - Supervisor / examiner: assigned projects only (a `ProjectMember` row)
 *   - Coordinator: any project in their institution
 *   - Admin:       any project in their institution
 *
 * Tenant isolation is enforced first: a project in another institution is never
 * accessible regardless of role. Returns `false` when the project does not
 * exist or the user has no basis to see it, so the caller neither joins the
 * room nor emits — a client cannot subscribe to a project it is not party to by
 * supplying an arbitrary `projectId`.
 */
export async function canAccessProject(
  user: SessionUser,
  projectId: string,
  db: ProjectAccessDb = prisma,
): Promise<boolean> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { institutionId: true, studentId: true },
  });

  // Unknown project, or one outside the caller's institution → no access.
  if (!project || project.institutionId !== user.institutionId) return false;

  switch (user.role) {
    case "admin":
    case "coordinator":
      // Full visibility within their own institution (already asserted above).
      return true;
    case "student":
      // Students may only reach their own project.
      return project.studentId === user.id;
    default: {
      // Supervisors, examiners, hod: only projects they are assigned to.
      const membership = await db.projectMember.findFirst({
        where: { projectId, userId: user.id },
        select: { id: true },
      });
      return membership !== null;
    }
  }
}

/**
 * Extract a valid `projectId` from a project-scoped payload, or `null` when the
 * payload is malformed (so handlers can drop it rather than throw across the
 * socket boundary).
 */
function readProjectId(
  payload: ProjectSubscriptionPayload | UserTypingPayload | undefined,
): string | null {
  if (!payload || typeof payload.projectId !== "string") return null;
  return payload.projectId;
}

/**
 * Subscribe a socket to a `project:{projectId}` room after authorizing its
 * principal against the project (existence, tenant, and role-based access — see
 * `canAccessProject`). This is the authorized subscription lifecycle: it is how
 * a participant — including a passive viewer who never types — starts receiving
 * that project's room events (message:new, feedback:new, document:uploaded,
 * project:stage_changed).
 *
 * An unknown or unauthorized project is silently not joined; the optional ack
 * reports the outcome so the client knows whether it is subscribed, without
 * leaking whether the project exists.
 */
async function handleProjectSubscribe(
  socket: AppSocket,
  payload: ProjectSubscriptionPayload,
  ack?: SubscriptionAck,
): Promise<void> {
  const projectId = readProjectId(payload);
  if (!projectId) {
    ack?.({ ok: false, projectId: "" });
    return;
  }

  const allowed = await canAccessProject(socket.data.user, projectId);
  if (allowed) socket.join(rooms.project(projectId));

  ack?.({ ok: allowed, projectId });
}

/**
 * Unsubscribe a socket from a project room. Leaving needs no authorization —
 * a socket may always drop a room it holds — and is a no-op if it was never a
 * member.
 */
function handleProjectUnsubscribe(
  socket: AppSocket,
  payload: ProjectSubscriptionPayload,
): void {
  const projectId = readProjectId(payload);
  if (!projectId) return;
  socket.leave(rooms.project(projectId));
}

/**
 * Relay a `user:typing` indicator to the rest of a project room.
 *
 * Typing authorizes and joins the room too (idempotent), so a client that
 * subscribed via `project:subscribe` and one that only ever types both behave
 * correctly; an unauthorized or unknown project is silently ignored, so a client
 * cannot subscribe to project-room events for records it may not see.
 *
 * The socket is authoritative for `userId` — the value is taken from the
 * authenticated principal, never from the client payload, so a client cannot
 * spoof another user's typing state.
 */
async function handleUserTyping(
  socket: AppSocket,
  payload: UserTypingPayload,
): Promise<void> {
  const projectId = readProjectId(payload);
  if (!projectId) return;

  // Authorize project access before joining or emitting. On any failure
  // (missing project, cross-institution, insufficient role) do nothing.
  const allowed = await canAccessProject(socket.data.user, projectId);
  if (!allowed) return;

  const room = rooms.project(projectId);
  socket.join(room);

  socket.to(room).emit(CLIENT_EVENTS.USER_TYPING, {
    projectId,
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

  socket.on(CLIENT_EVENTS.PROJECT_SUBSCRIBE, (payload, ack) => {
    // Async authorization lookup: a failure must not crash the connection.
    void handleProjectSubscribe(socket, payload, ack).catch((error) => {
      console.error("project:subscribe handler failed:", error);
      ack?.({ ok: false, projectId: readProjectId(payload) ?? "" });
    });
  });

  socket.on(CLIENT_EVENTS.PROJECT_UNSUBSCRIBE, (payload) => {
    handleProjectUnsubscribe(socket, payload);
  });

  socket.on(CLIENT_EVENTS.USER_TYPING, (payload) => {
    // The handler authorizes against the database, so it is async; a rejected
    // authorization lookup must not crash the connection — log and drop it.
    void handleUserTyping(socket, payload).catch((error) => {
      console.error("user:typing handler failed:", error);
    });
  });
}
