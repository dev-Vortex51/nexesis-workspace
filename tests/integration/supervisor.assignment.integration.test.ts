import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../server/lib/prisma";
import userRoutes from "../../server/routes/users";

/**
 * Integration tests for POST /users/:id/assign-supervisor (unit 1.5).
 *
 * The real user router is mounted over the real auth + RBAC stack and driven
 * end-to-end with live session cookies. These prove: auth is required (401);
 * only coordinator/admin may assign (403 for a student); a valid assignment
 * creates the primary-supervisor membership and advances the project to Topic
 * Proposal; reassignment keeps a single primary supervisor; a non-supervisor
 * body is rejected (400); and tenant isolation (a student in another
 * institution → 404).
 *
 * Skips automatically when Postgres is unreachable (same pattern as the other
 * route integration tests).
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
const ids: Record<string, string> = {};
let institutionId: string;
let otherInstitutionId: string;
let departmentId: string;
let sessionId: string;
let projectId: string;
let otherStudentId: string;
let otherProjectId: string;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/users", userRoutes);
  return app;
}

async function seedUser(
  role: string,
  instId: string,
  emailKey: string,
): Promise<string> {
  const email = `assign.${emailKey}.${stamp}@nexesis.edu`;
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `User ${role}`,
      firstName: "User",
      lastName: role,
      role,
      institutionId: instId,
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
      name: "Assign Test",
      slug: `assign-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

  const other = await prisma.institution.create({
    data: {
      name: "Assign Other",
      slug: `assign-other-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  otherInstitutionId = other.id;

  const department = await prisma.department.create({
    data: { institutionId, name: "Computer Science", code: `CSC${stamp}`.slice(0, 20) },
  });
  departmentId = department.id;

  const otherDepartment = await prisma.department.create({
    data: { institutionId: otherInstitutionId, name: "CS", code: `OCS${stamp}`.slice(0, 20) },
  });

  const session = await prisma.academicSession.create({
    data: {
      institutionId,
      name: `2026/2027-${stamp}`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
      status: "active",
      settings: {},
    },
  });
  sessionId = session.id;

  const otherSession = await prisma.academicSession.create({
    data: {
      institutionId: otherInstitutionId,
      name: `2026/2027-other-${stamp}`,
      startDate: new Date("2026-09-01"),
      endDate: new Date("2027-06-30"),
      status: "active",
      settings: {},
    },
  });

  ids.admin = await seedUser("admin", institutionId, "admin");
  ids.coordinator = await seedUser("coordinator", institutionId, "coordinator");
  ids.student = await seedUser("student", institutionId, "student");
  ids.supervisor = await seedUser("supervisor", institutionId, "supervisor");
  ids.supervisor2 = await seedUser("supervisor", institutionId, "supervisor2");
  otherStudentId = await seedUser("student", otherInstitutionId, "foreignstudent");

  const project = await prisma.project.create({
    data: {
      institutionId,
      departmentId,
      sessionId,
      studentId: ids.student,
      currentStage: "registration",
      stageStatus: "pending",
      progress: 0,
    },
  });
  projectId = project.id;

  const otherProject = await prisma.project.create({
    data: {
      institutionId: otherInstitutionId,
      departmentId: otherDepartment.id,
      sessionId: otherSession.id,
      studentId: otherStudentId,
      currentStage: "registration",
      stageStatus: "pending",
      progress: 0,
    },
  });
  otherProjectId = otherProject.id;

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

  for (const role of ["admin", "coordinator", "student"]) {
    const email = `assign.${role}.${stamp}@nexesis.edu`;
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
  const allUserIds = [...Object.values(ids), otherStudentId];
  await prisma.projectMember.deleteMany({
    where: { projectId: { in: [projectId, otherProjectId] } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: [projectId, otherProjectId] } },
  });
  await prisma.academicSession.deleteMany({
    where: { institutionId: { in: [institutionId, otherInstitutionId] } },
  });
  await prisma.session.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  await prisma.department.deleteMany({
    where: { institutionId: { in: [institutionId, otherInstitutionId] } },
  });
  await prisma.institution.deleteMany({
    where: { id: { in: [institutionId, otherInstitutionId] } },
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /users/:id/assign-supervisor — authorization", () => {
  it.runIf(dbAvailable)("rejects an unauthenticated request (401)", async () => {
    const { status, json } = await req(
      "POST",
      `/users/${ids.student}/assign-supervisor`,
      undefined,
      { supervisorId: ids.supervisor },
    );
    expect(status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it.runIf(dbAvailable)("forbids a student from assigning (403)", async () => {
    const { status } = await req(
      "POST",
      `/users/${ids.student}/assign-supervisor`,
      cookies.student,
      { supervisorId: ids.supervisor },
    );
    expect(status).toBe(403);
  });
});

describe("POST /users/:id/assign-supervisor — assignment & stage transition", () => {
  it.runIf(dbAvailable)(
    "coordinator assigns a supervisor and advances to topic_proposal",
    async () => {
      const { status, json } = await req(
        "POST",
        `/users/${ids.student}/assign-supervisor`,
        cookies.coordinator,
        { supervisorId: ids.supervisor },
      );
      expect(status).toBe(200);
      expect(json.data.supervisor.id).toBe(ids.supervisor);
      expect(json.data.currentStage).toBe("topic_proposal");
      expect(json.data.stageStatus).toBe("pending");

      const members = await prisma.projectMember.findMany({
        where: { projectId, role: "primary_supervisor" },
      });
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(ids.supervisor);

      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });
      expect(project.currentStage).toBe("topic_proposal");
    },
  );

  it.runIf(dbAvailable)(
    "reassigns to a new supervisor keeping a single primary",
    async () => {
      const { status, json } = await req(
        "POST",
        `/users/${ids.student}/assign-supervisor`,
        cookies.admin,
        { supervisorId: ids.supervisor2 },
      );
      expect(status).toBe(200);
      expect(json.data.supervisor.id).toBe(ids.supervisor2);
      // No longer at supervisor assignment → stage unchanged.
      expect(json.data.currentStage).toBe("topic_proposal");

      const members = await prisma.projectMember.findMany({
        where: { projectId, role: "primary_supervisor" },
      });
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(ids.supervisor2);
    },
  );

  it.runIf(dbAvailable)(
    "rejects assigning a non-supervisor user (400)",
    async () => {
      const { status, json } = await req(
        "POST",
        `/users/${ids.student}/assign-supervisor`,
        cookies.coordinator,
        { supervisorId: ids.coordinator },
      );
      expect(status).toBe(400);
      expect(json.error.code).toBe("VALIDATION_ERROR");
    },
  );

  it.runIf(dbAvailable)(
    "404s for a student in another institution (tenant isolation)",
    async () => {
      const { status, json } = await req(
        "POST",
        `/users/${otherStudentId}/assign-supervisor`,
        cookies.admin,
        { supervisorId: ids.supervisor },
      );
      expect(status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    },
  );
});
