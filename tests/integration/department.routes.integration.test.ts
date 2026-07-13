import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../server/lib/prisma";
import departmentRoutes from "../../server/routes/departments";
import { USER_ROLES } from "../../shared/schemas/auth";

/**
 * Integration tests for the department CRUD routes (unit 1.2).
 *
 * The real department router is mounted over the real auth + RBAC stack and
 * driven end-to-end with a live session cookie per role. Unlike institutions
 * (super-admin, fails closed), the department spec gates only POST to admin;
 * list/get are available to any authenticated caller and everything is scoped
 * to the caller's institution. These tests prove: auth is required (401), only
 * admin may create (403 for the rest, 201 for admin), reads work for a
 * non-admin role, cross-institution access is 404 (tenant isolation), and the
 * "no active projects" delete guard returns 409.
 *
 * Skips automatically when Postgres is unreachable (same pattern as the
 * institution route test).
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
const createdDepartmentIds: string[] = [];
let institutionId: string;
let otherInstitutionId: string;
let otherDeptId: string;
let guardedDeptId: string;
let guardedSessionId: string;
let guardedStudentId: string;
let guardedProjectId: string;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/departments", departmentRoutes);
  return app;
}

async function seedUser(role: string): Promise<string> {
  const email = `dept.${role}.${stamp}@nexesis.edu`;
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `Dept ${role}`,
      firstName: "Dept",
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
      name: "Dept Route Test",
      slug: `dept-route-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

  const other = await prisma.institution.create({
    data: {
      name: "Dept Route Other",
      slug: `dept-route-other-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  otherInstitutionId = other.id;

  // A department in the OTHER institution — must be invisible to our caller.
  const otherDept = await prisma.department.create({
    data: { institutionId: otherInstitutionId, name: "Foreign", code: "FGN" },
  });
  otherDeptId = otherDept.id;

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
    const email = `dept.${role}.${stamp}@nexesis.edu`;
    const res = await fetch(`${baseUrl}/probe/login-proxy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    cookies[role] = (res.headers.get("set-cookie") ?? "").split(";")[0];
  }

  // A department in OUR institution with one active project, to exercise the
  // "no active projects" delete guard.
  const guardedDept = await prisma.department.create({
    data: { institutionId, name: "Guarded", code: "GRD" },
  });
  guardedDeptId = guardedDept.id;
  const session = await prisma.academicSession.create({
    data: {
      institutionId,
      name: `Guard Session ${stamp}`,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      status: "active",
      settings: {},
    },
  });
  guardedSessionId = session.id;
  guardedStudentId = seededUserIds[USER_ROLES.indexOf("student")];
  const project = await prisma.project.create({
    data: {
      institutionId,
      departmentId: guardedDeptId,
      sessionId: guardedSessionId,
      studentId: guardedStudentId,
      currentStage: "registration",
      stageStatus: "pending",
      progress: 0,
    },
  });
  guardedProjectId = project.id;
});

afterAll(async () => {
  if (!dbAvailable) return;
  await prisma.project.deleteMany({ where: { id: guardedProjectId } });
  await prisma.academicSession.deleteMany({ where: { id: guardedSessionId } });
  await prisma.session.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: seededUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
  await prisma.department.deleteMany({
    where: { id: { in: [...createdDepartmentIds, guardedDeptId, otherDeptId] } },
  });
  await prisma.institution.deleteMany({
    where: { id: { in: [institutionId, otherInstitutionId] } },
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Department routes — authentication gate", () => {
  it.runIf(dbAvailable)("rejects unauthenticated list (401)", async () => {
    const { status, json } = await req("GET", "/departments");
    expect(status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it.runIf(dbAvailable)("rejects unauthenticated create (401)", async () => {
    const { status } = await req("POST", "/departments", undefined, {
      name: "X",
      code: "X",
    });
    expect(status).toBe(401);
  });
});

describe("Department routes — create authorization (admin only)", () => {
  it.runIf(dbAvailable)(
    "forbids POST /departments for every non-admin role (403)",
    async () => {
      for (const role of USER_ROLES.filter((r) => r !== "admin")) {
        const { status } = await req("POST", "/departments", cookies[role], {
          name: `Blocked ${role}`,
          code: `B${role}`.slice(0, 8),
        });
        expect(status, `role=${role}`).toBe(403);
      }
    },
  );

  it.runIf(dbAvailable)("allows admin to create a department (201)", async () => {
    const { status, json } = await req("POST", "/departments", cookies.admin, {
      name: "Computer Science",
      code: `CSC${stamp}`.slice(0, 20),
    });
    expect(status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.institutionId).toBe(institutionId);
    createdDepartmentIds.push(json.data.id);
  });

  it.runIf(dbAvailable)("rejects a duplicate code in the institution (409)", async () => {
    const code = `DUP${stamp}`.slice(0, 20);
    const first = await req("POST", "/departments", cookies.admin, {
      name: "First",
      code,
    });
    expect(first.status).toBe(201);
    createdDepartmentIds.push(first.json.data.id);

    const dup = await req("POST", "/departments", cookies.admin, {
      name: "Second",
      code: code.toLowerCase(),
    });
    expect(dup.status).toBe(409);
    expect(dup.json.error.code).toBe("CONFLICT");
  });

  it.runIf(dbAvailable)("rejects an invalid body (400)", async () => {
    const { status, json } = await req("POST", "/departments", cookies.admin, {
      name: "",
      code: "",
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Department routes — reads (authenticated, tenant-scoped)", () => {
  it.runIf(dbAvailable)("lists departments for a non-admin role", async () => {
    const { status, json } = await req("GET", "/departments", cookies.coordinator);
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    // The foreign-institution department must not appear.
    expect(json.data.map((d: any) => d.id)).not.toContain(otherDeptId);
  });

  it.runIf(dbAvailable)(
    "returns a department with user count and project stats",
    async () => {
      const { status, json } = await req(
        "GET",
        `/departments/${guardedDeptId}`,
        cookies.coordinator,
      );
      expect(status).toBe(200);
      expect(json.data.projectStats.total).toBeGreaterThanOrEqual(1);
      expect(json.data.projectStats.active).toBeGreaterThanOrEqual(1);
      expect(typeof json.data.userCount).toBe("number");
    },
  );

  it.runIf(dbAvailable)(
    "returns 404 for a department in another institution (tenant isolation)",
    async () => {
      const { status, json } = await req(
        "GET",
        `/departments/${otherDeptId}`,
        cookies.admin,
      );
      expect(status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    },
  );
});

describe("Department routes — delete guard", () => {
  it.runIf(dbAvailable)(
    "refuses to delete a department with active projects (409)",
    async () => {
      const { status, json } = await req(
        "DELETE",
        `/departments/${guardedDeptId}`,
        cookies.admin,
      );
      expect(status).toBe(409);
      expect(json.error.code).toBe("CONFLICT");
    },
  );

  it.runIf(dbAvailable)(
    "deletes a department with no projects (200)",
    async () => {
      const created = await req("POST", "/departments", cookies.admin, {
        name: "Disposable",
        code: `DSP${stamp}`.slice(0, 20),
      });
      expect(created.status).toBe(201);
      const id = created.json.data.id;

      const { status, json } = await req(
        "DELETE",
        `/departments/${id}`,
        cookies.admin,
      );
      expect(status).toBe(200);
      expect(json.data.deleted).toBe(true);
    },
  );
});
