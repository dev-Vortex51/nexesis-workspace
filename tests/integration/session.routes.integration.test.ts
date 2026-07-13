import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../server/lib/prisma";
import sessionRoutes from "../../server/routes/sessions";
import { USER_ROLES } from "../../shared/schemas/auth";

/**
 * Integration tests for the academic-session routes (unit 1.3).
 *
 * The real session router is mounted over the real auth + RBAC stack and driven
 * end-to-end with a live session cookie per role. The spec gates POST /sessions
 * to coordinator/admin, and this unit extends the same "coordinator and admin"
 * gate to update/activate/close; the reads are available to any authenticated
 * caller and everything is scoped to the caller's institution. These tests
 * prove: auth is required (401), only coordinator/admin may create+manage (403
 * for the rest, 201/200 for the privileged roles), reads work for a non-managing
 * role, cross-institution access is 404 (tenant isolation), and activate closes
 * the previously active session.
 *
 * Skips automatically when Postgres is unreachable (same pattern as the
 * department route test).
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

const cookies: Record<string, string> = {};
const seededUserIds: string[] = [];
const createdSessionIds: string[] = [];
let institutionId: string;
let otherInstitutionId: string;
let otherSessionId: string;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/sessions", sessionRoutes);
  return app;
}

async function seedUser(role: string): Promise<string> {
  const email = `sess.${role}.${stamp}@nexesis.edu`;
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `Sess ${role}`,
      firstName: "Sess",
      lastName: role,
      role,
      institutionId,
    } as never,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return user.id;
}

async function req(
  method: string,
  path: string,
  cookie?: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => {
  if (!dbAvailable) return;

  const institution = await prisma.institution.create({
    data: {
      name: "Sess Route Test",
      slug: `sess-route-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

  const other = await prisma.institution.create({
    data: {
      name: "Sess Route Other",
      slug: `sess-route-other-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  otherInstitutionId = other.id;

  // A session in the OTHER institution — must be invisible to our caller.
  const otherSession = await prisma.academicSession.create({
    data: {
      institutionId: otherInstitutionId,
      name: `Foreign Session ${stamp}`,
      startDate: new Date("2025-09-01"),
      endDate: new Date("2026-08-31"),
      status: "planning",
      settings: {},
    },
  });
  otherSessionId = otherSession.id;

  for (const role of USER_ROLES) {
    seededUserIds.push(await seedUser(role));
  }

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
    const email = `sess.${role}.${stamp}@nexesis.edu`;
    const res = await fetch(`${baseUrl}/probe/login-proxy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    cookies[role] = (res.headers.get("set-cookie") ?? "").split(";")[0];
  }
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.session.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
  await prisma.academicSession.deleteMany({
    where: { id: { in: [...createdSessionIds, otherSessionId] } },
  });
  await prisma.institution.deleteMany({
    where: { id: { in: [institutionId, otherInstitutionId] } },
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const validBody = () => ({
  name: `Session ${stamp}-${Math.random().toString(36).slice(2, 8)}`,
  startDate: "2025-09-01",
  endDate: "2026-08-31",
  settings: { topicProposalDeadline: "2025-10-01" },
});

describe("Session routes — authentication gate", () => {
  it.runIf(dbAvailable)("rejects unauthenticated list (401)", async () => {
    const { status, json } = await req("GET", "/sessions");
    expect(status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it.runIf(dbAvailable)("rejects unauthenticated create (401)", async () => {
    const { status } = await req("POST", "/sessions", undefined, validBody());
    expect(status).toBe(401);
  });
});

describe("Session routes — create authorization (coordinator/admin)", () => {
  it.runIf(dbAvailable)(
    "forbids POST /sessions for roles without the permission (403)",
    async () => {
      for (const role of USER_ROLES.filter(
        (r) => r !== "admin" && r !== "coordinator",
      )) {
        const { status } = await req("POST", "/sessions", cookies[role], validBody());
        expect(status, `role=${role}`).toBe(403);
      }
    },
  );

  it.runIf(dbAvailable)("allows admin to create a session (201, planning)", async () => {
    const { status, json } = await req("POST", "/sessions", cookies.admin, validBody());
    expect(status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.institutionId).toBe(institutionId);
    expect(json.data.status).toBe("planning");
    createdSessionIds.push(json.data.id);
  });

  it.runIf(dbAvailable)("allows coordinator to create a session (201)", async () => {
    const { status, json } = await req(
      "POST",
      "/sessions",
      cookies.coordinator,
      validBody(),
    );
    expect(status).toBe(201);
    createdSessionIds.push(json.data.id);
  });

  it.runIf(dbAvailable)("rejects a duplicate name in the institution (409)", async () => {
    const body = validBody();
    const first = await req("POST", "/sessions", cookies.admin, body);
    expect(first.status).toBe(201);
    createdSessionIds.push(first.json.data.id);

    const dup = await req("POST", "/sessions", cookies.admin, body);
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("CONFLICT");
  });

  it.runIf(dbAvailable)("rejects an invalid body (400)", async () => {
    const { status, json } = await req("POST", "/sessions", cookies.admin, {
      name: "",
      startDate: "not-a-date",
      endDate: "2026-08-31",
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Session routes — reads (authenticated, tenant-scoped)", () => {
  it.runIf(dbAvailable)("lists sessions for a non-managing role", async () => {
    const { status, json } = await req("GET", "/sessions", cookies.student);
    expect(status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.map((s: any) => s.id)).not.toContain(otherSessionId);
  });

  it.runIf(dbAvailable)(
    "returns a session with project counts and completion stats",
    async () => {
      const id = createdSessionIds[0];
      const { status, json } = await req("GET", `/sessions/${id}`, cookies.student);
      expect(status).toBe(200);
      expect(json.data.projectCounts).toEqual({ total: 0, active: 0, completed: 0 });
      expect(json.data.completionRate).toBe(0);
    },
  );

  it.runIf(dbAvailable)(
    "returns 404 for a session in another institution (tenant isolation)",
    async () => {
      const { status, json } = await req(
        "GET",
        `/sessions/${otherSessionId}`,
        cookies.admin,
      );
      expect(status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    },
  );
});

describe("Session routes — update (coordinator/admin)", () => {
  it.runIf(dbAvailable)("forbids update for a non-managing role (403)", async () => {
    const id = createdSessionIds[0];
    const { status } = await req("PATCH", `/sessions/${id}`, cookies.student, {
      name: "Nope",
    });
    expect(status).toBe(403);
  });

  it.runIf(dbAvailable)("allows coordinator to update a session (200)", async () => {
    const id = createdSessionIds[0];
    const newName = `Updated ${stamp}`;
    const { status, json } = await req(
      "PATCH",
      `/sessions/${id}`,
      cookies.coordinator,
      { name: newName },
    );
    expect(status).toBe(200);
    expect(json.data.name).toBe(newName);
  });
});

describe("Session routes — activate / close transitions", () => {
  it.runIf(dbAvailable)("forbids activate for a non-managing role (403)", async () => {
    const id = createdSessionIds[0];
    const { status } = await req(
      "POST",
      `/sessions/${id}/activate`,
      cookies.student,
    );
    expect(status).toBe(403);
  });

  it.runIf(dbAvailable)(
    "activates a session and closes the previously active one",
    async () => {
      const first = createdSessionIds[0];
      const second = createdSessionIds[1];

      const a1 = await req("POST", `/sessions/${first}/activate`, cookies.admin);
      expect(a1.status).toBe(200);
      expect(a1.json.data.status).toBe("active");

      const a2 = await req("POST", `/sessions/${second}/activate`, cookies.admin);
      expect(a2.status).toBe(200);
      expect(a2.json.data.status).toBe("active");

      // The first session must have been closed by the second activation.
      const check = await req("GET", `/sessions/${first}`, cookies.admin);
      expect(check.json.data.status).toBe("closed");
    },
  );

  it.runIf(dbAvailable)("closes a session (200)", async () => {
    const id = createdSessionIds[1];
    const { status, json } = await req(
      "POST",
      `/sessions/${id}/close`,
      cookies.coordinator,
    );
    expect(status).toBe(200);
    expect(json.data.status).toBe("closed");
  });
});
