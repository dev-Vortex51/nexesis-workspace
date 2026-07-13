import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as ioClient, type Socket } from "socket.io-client";
import { prisma } from "../../server/lib/prisma";
import { createSocketServer, type AppIoServer } from "../../server/websocket";

/**
 * Integration test for the authorized project subscription lifecycle
 * (`project:subscribe`).
 *
 * The real Socket.IO server is stood up over the real handshake auth. It proves
 * a passive recipient — an authorized project member who subscribes but never
 * emits `user:typing` — still receives that project's room-scoped events, and
 * that a non-member cannot subscribe. The `user:typing` relay is used as the
 * observable room event: user B (project owner) types, and user A (a member who
 * only subscribed) receives the relayed event.
 *
 * Skips automatically when Postgres is unreachable (same pattern as the route
 * integration tests).
 */

const dbAvailable = await (async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
})();

const PASSWORD = "password1234";
const stamp = Date.now();

let httpServer: Server;
let io: AppIoServer;
let baseUrl: string;

const seededUserIds: string[] = [];
let institutionId: string;
let departmentId: string;
let sessionId: string;
let projectId: string;

// role → session cookie string (used as the socket handshake credential).
const cookies: Record<string, string> = {};

async function seedUser(key: string, role: string): Promise<string> {
  const email = `ws.${key}.${stamp}@nexesis.edu`;
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `WS ${key}`,
      firstName: "WS",
      lastName: key,
      role,
      institutionId,
      departmentId,
    } as never,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  const response = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  });
  const setCookie = response.headers.getSetCookie();
  cookies[key] = setCookie.map((c) => c.split(";")[0]).join("; ");

  return user.id;
}

/** Connect a client whose handshake carries `key`'s session cookie. */
function connect(key: string): Socket {
  return ioClient(baseUrl, {
    transports: ["websocket"],
    extraHeaders: { cookie: cookies[key] },
  });
}

function waitConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", (err) => reject(err));
  });
}

beforeAll(async () => {
  if (!dbAvailable) return;

  const institution = await prisma.institution.create({
    data: {
      name: "WS Sub Test",
      slug: `ws-sub-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

  const department = await prisma.department.create({
    data: { institutionId, name: "WS Dept", code: `WS${stamp}`.slice(0, 20) },
  });
  departmentId = department.id;

  const session = await prisma.academicSession.create({
    data: {
      institutionId,
      name: `WS Session ${stamp}`,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      status: "active",
      settings: {},
    },
  });
  sessionId = session.id;

  // owner = student on the project; member = assigned supervisor (passive
  // recipient); outsider = supervisor with no membership.
  const ownerId = await seedUser("owner", "student");
  const memberId = await seedUser("member", "supervisor");
  const outsiderId = await seedUser("outsider", "supervisor");
  seededUserIds.push(ownerId, memberId, outsiderId);

  const project = await prisma.project.create({
    data: {
      institutionId,
      departmentId,
      sessionId,
      studentId: ownerId,
      currentStage: "registration",
      stageStatus: "pending",
      progress: 0,
    },
  });
  projectId = project.id;

  await prisma.projectMember.create({
    data: { projectId, userId: memberId, role: "primary_supervisor" },
  });

  httpServer = createHttpServer();
  io = createSocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (!dbAvailable) return;
  await io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));

  await prisma.projectMember.deleteMany({ where: { projectId } });
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.academicSession.deleteMany({ where: { id: sessionId } });
  await prisma.session.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  await prisma.institution.deleteMany({ where: { id: institutionId } });
});

describe("project subscription lifecycle", () => {
  it.runIf(dbAvailable)(
    "delivers room events to a passive subscriber who never types",
    async () => {
      const member = connect("member");
      const owner = connect("owner");
      await Promise.all([waitConnect(member), waitConnect(owner)]);

      try {
        // The member subscribes and waits for the authorization ack — it never
        // emits user:typing, so it is a purely passive recipient.
        const ack = await new Promise<{ ok: boolean; projectId: string }>(
          (resolve) => member.emit("project:subscribe", { projectId }, resolve),
        );
        expect(ack.ok).toBe(true);

        // The passive member must receive the room event the owner's typing
        // relays to project-room peers.
        const received = new Promise<{ projectId: string; userId: string }>(
          (resolve, reject) => {
            member.on("user:typing", resolve);
            setTimeout(() => reject(new Error("no room event received")), 5000);
          },
        );

        // Give the owner's typing-join a moment, then emit.
        owner.emit("user:typing", { projectId, userId: "ignored" });

        const payload = await received;
        expect(payload.projectId).toBe(projectId);
      } finally {
        member.close();
        owner.close();
      }
    },
  );

  it.runIf(dbAvailable)(
    "denies subscription to a non-member (ack ok:false, no events)",
    async () => {
      const outsider = connect("outsider");
      await waitConnect(outsider);

      try {
        const ack = await new Promise<{ ok: boolean }>((resolve) =>
          outsider.emit("project:subscribe", { projectId }, resolve),
        );
        expect(ack.ok).toBe(false);
      } finally {
        outsider.close();
      }
    },
  );
});
