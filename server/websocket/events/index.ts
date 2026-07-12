import type { Server, Socket } from "socket.io";
import { prisma } from "../../lib/prisma";
import {
  CLIENT_EVENTS,
  rooms,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
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
 * Relay a `user:typing` indicator to the rest of a project room.
 *
 * The typing event is the only project-scoped client→server event in the spec,
 * so it doubles as the point where a participant's socket joins that project
 * room (idempotent). Before joining, the socket's principal is authorized
 * against the project (existence, tenant, and role-based access — see
 * `canAccessProject`); an unauthorized or unknown project is silently ignored,
 * so a client cannot subscribe to project-room events (messages, feedback,
 * document uploads, stage changes) for records it may not see.
 *
 * The socket is authoritative for `userId` — the value is taken from the
 * authenticated principal, never from the client payload, so a client cannot
 * spoof another user's typing state.
 */
async function handleUserTyping(
  socket: AppSocket,
  payload: UserTypingPayload,
): Promise<void> {
  // Ignore malformed payloads rather than throwing across the socket boundary.
  if (!payload || typeof payload.projectId !== "string") return;

  // Authorize project access before joining or emitting. On any failure
  // (missing project, cross-institution, insufficient role) do nothing.
  const allowed = await canAccessProject(socket.data.user, payload.projectId);
  if (!allowed) return;

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

  socket.on(CLIENT_EVENTS.USER_TYPING, (payload) => {
    // The handler authorizes against the database, so it is async; a rejected
    // authorization lookup must not crash the connection — log and drop it.
    void handleUserTyping(socket, payload).catch((error) => {
      console.error("user:typing handler failed:", error);
    });
  });
}
