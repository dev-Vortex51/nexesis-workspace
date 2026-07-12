import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../server/lib/prisma";
import { requireAuth } from "../../server/middleware/auth";
import {
  requirePermission,
  requireOwnership,
} from "../../server/middleware/rbac";
import { PERMISSIONS } from "../../shared/constants/permissions";
import { USER_ROLES } from "../../shared/schemas/auth";

/**
 * Integration tests for the RBAC middleware (unit 0.4).
 *
 * A minimal Express app mounts the real authentication + RBAC stack over a set
 * of probe routes — one per representative spec permission plus an
 * ownership-scoped route — and drives them end-to-end with a live session
 * cookie for each of the six User.role values. This proves the permission
 * matrix and the guards enforce authorization exactly as the API spec
 * annotates it (admin-only, coordinator/admin, supervisor-only, student-only,
 * and "owner or admin").
 *
 * Skips automatically when Postgres is unreachable so unit runs stay green in
 * environments without a database (same pattern as the auth integration test).
 */

let server: Server;
let baseUrl: string;

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

// One seeded user id + login cookie per role.
const cookies: Record<string, string> = {};
const seededUserIds: string[] = [];
let institutionId: string;

/** Build the probe app: real requireAuth + RBAC guards on throwaway routes. */
function createTestApp() {
  const app = express();
  app.use(express.json());

  const ok = (_req: express.Request, res: express.Response) =>
    res.status(200).json({ success: true, data: { ok: true }, error: null });

  // admin-only (GET /audit-logs → AUDIT_READ)
  app.get(
    "/probe/audit-logs",
    requireAuth,
    requirePermission(PERMISSIONS.AUDIT_READ),
    ok,
  );

  // coordinator/admin (POST /rubrics → RUBRIC_CREATE)
  app.post(
    "/probe/rubrics",
    requireAuth,
    requirePermission(PERMISSIONS.RUBRIC_CREATE),
    ok,
  );

  // supervisor-only (POST /projects/:id/approve-topic → PROJECT_APPROVE_TOPIC)
  app.post(
    "/probe/approve-topic",
    requireAuth,
    requirePermission(PERMISSIONS.PROJECT_APPROVE_TOPIC),
    ok,
  );

  // student-only (POST /projects/:id/submit-topics → PROJECT_SUBMIT_TOPICS)
  app.post(
    "/probe/submit-topics",
    requireAuth,
    requirePermission(PERMISSIONS.PROJECT_SUBMIT_TOPICS),
    ok,
  );

  // ownership-scoped with admin override (DELETE /feedback/:id → author or admin).
  // The resource "owner" is the user whose id is in :ownerId.
  app.delete(
    "/probe/feedback/:ownerId",
    requireAuth,
    requireOwnership(
      async (req) => (req.params as { ownerId?: string }).ownerId ?? null,
      PERMISSIONS.FEEDBACK_DELETE_ANY,
    ),
    ok,
  );

  return app;
}

async function seedUser(role: string): Promise<string> {
  const email = `rbac.${role}.${stamp}@nexesis.edu`;
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `RBAC ${role}`,
      firstName: "Rbac",
      lastName: role,
      role,
      institutionId,
    } as never,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return user.id;
}

async function loginCookie(role: string): Promise<string> {
  const email = `rbac.${role}.${stamp}@nexesis.edu`;
  const res = await fetch(`${baseUrl}/probe/login-proxy`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

async function req(
  method: string,
  path: string,
  cookie?: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
  });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  if (!dbAvailable) return;

  const institution = await prisma.institution.create({
    data: {
      name: "RBAC Institution",
      slug: `rbac-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

  // Seed one user per role.
  for (const role of USER_ROLES) {
    seededUserIds.push(await seedUser(role));
  }

  // The probe app also exposes a login proxy so the tests can obtain real
  // session cookies through Better Auth (mounted alongside the guarded routes).
  const app = createTestApp();
  const { auth } = await import("../../server/auth");
  app.post("/probe/login-proxy", async (reqex, resex) => {
    const response = await auth.api.signInEmail({
      body: {
        email: (reqex.body as { email: string }).email,
        password: (reqex.body as { password: string }).password,
      },
      asResponse: true,
    });
    const setCookie = response.headers.getSetCookie();
    if (setCookie.length) resex.setHeader("Set-Cookie", setCookie);
    resex.status(response.status).json({ ok: response.ok });
  });

  server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;

  for (const role of USER_ROLES) {
    cookies[role] = await loginCookie(role);
  }
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.session.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
  await prisma.institution.deleteMany({ where: { id: institutionId } });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("RBAC middleware — authentication gate", () => {
  it.runIf(dbAvailable)("rejects an unauthenticated request (401)", async () => {
    const { status, json } = await req("GET", "/probe/audit-logs");
    expect(status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});

describe("RBAC middleware — requirePermission (admin-only: audit:read)", () => {
  it.runIf(dbAvailable)("allows admin (200)", async () => {
    const { status } = await req("GET", "/probe/audit-logs", cookies.admin);
    expect(status).toBe(200);
  });

  it.runIf(dbAvailable)(
    "forbids every non-admin role (403)",
    async () => {
      for (const role of ["student", "supervisor", "coordinator", "hod", "examiner"]) {
        const { status, json } = await req(
          "GET",
          "/probe/audit-logs",
          cookies[role],
        );
        expect(status, `role=${role}`).toBe(403);
        expect(json.error.code).toBe("FORBIDDEN");
      }
    },
  );
});

describe("RBAC middleware — requirePermission (coordinator/admin: rubric:create)", () => {
  it.runIf(dbAvailable)("allows coordinator and admin (200)", async () => {
    for (const role of ["coordinator", "admin"]) {
      const { status } = await req("POST", "/probe/rubrics", cookies[role]);
      expect(status, `role=${role}`).toBe(200);
    }
  });

  it.runIf(dbAvailable)(
    "forbids student, supervisor, hod, examiner (403)",
    async () => {
      for (const role of ["student", "supervisor", "hod", "examiner"]) {
        const { status } = await req("POST", "/probe/rubrics", cookies[role]);
        expect(status, `role=${role}`).toBe(403);
      }
    },
  );
});

describe("RBAC middleware — requirePermission (supervisor-only: project:approve-topic)", () => {
  it.runIf(dbAvailable)("allows supervisor (200)", async () => {
    const { status } = await req(
      "POST",
      "/probe/approve-topic",
      cookies.supervisor,
    );
    expect(status).toBe(200);
  });

  it.runIf(dbAvailable)(
    "forbids other roles incl. admin and coordinator (403)",
    async () => {
      for (const role of ["student", "coordinator", "hod", "admin", "examiner"]) {
        const { status } = await req(
          "POST",
          "/probe/approve-topic",
          cookies[role],
        );
        expect(status, `role=${role}`).toBe(403);
      }
    },
  );
});

describe("RBAC middleware — requirePermission (student-only: project:submit-topics)", () => {
  it.runIf(dbAvailable)("allows student (200)", async () => {
    const { status } = await req(
      "POST",
      "/probe/submit-topics",
      cookies.student,
    );
    expect(status).toBe(200);
  });

  it.runIf(dbAvailable)("forbids supervisor and admin (403)", async () => {
    for (const role of ["supervisor", "admin"]) {
      const { status } = await req(
        "POST",
        "/probe/submit-topics",
        cookies[role],
      );
      expect(status, `role=${role}`).toBe(403);
    }
  });
});

describe("RBAC middleware — requireOwnership (feedback: author or admin)", () => {
  it.runIf(dbAvailable)(
    "allows the owner to act on their own resource (200)",
    async () => {
      const studentEmail = `rbac.student.${stamp}@nexesis.edu`;
      const owner = await prisma.user.findUniqueOrThrow({
        where: { email: studentEmail },
      });
      const { status } = await req(
        "DELETE",
        `/probe/feedback/${owner.id}`,
        cookies.student,
      );
      expect(status).toBe(200);
    },
  );

  it.runIf(dbAvailable)(
    "forbids a non-owner without the override permission (403)",
    async () => {
      const studentEmail = `rbac.student.${stamp}@nexesis.edu`;
      const owner = await prisma.user.findUniqueOrThrow({
        where: { email: studentEmail },
      });
      // supervisor is neither the owner nor holds feedback:delete-any
      const { status } = await req(
        "DELETE",
        `/probe/feedback/${owner.id}`,
        cookies.supervisor,
      );
      expect(status).toBe(403);
    },
  );

  it.runIf(dbAvailable)(
    "allows admin to override ownership via feedback:delete-any (200)",
    async () => {
      const studentEmail = `rbac.student.${stamp}@nexesis.edu`;
      const owner = await prisma.user.findUniqueOrThrow({
        where: { email: studentEmail },
      });
      const { status } = await req(
        "DELETE",
        `/probe/feedback/${owner.id}`,
        cookies.admin,
      );
      expect(status).toBe(200);
    },
  );
});
