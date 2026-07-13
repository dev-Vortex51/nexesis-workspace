import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../server/lib/prisma";
import userRoutes from "../../server/routes/users";
import { USER_ROLES } from "../../shared/schemas/auth";

/**
 * Integration tests for the user management routes (unit 1.4).
 *
 * The real user router is mounted over the real auth + RBAC stack and driven
 * end-to-end with a live session cookie per role. These prove: auth is required
 * (401); only admin may create (403 for the rest, 201 for admin) and suspend;
 * PATCH is "admin or self" (a student may edit themselves but not another user,
 * and cannot change their own role); filtering by role/search works; reads are
 * tenant-scoped (a user in another institution is 404); and DELETE suspends
 * (status → suspended) rather than removing the row.
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
const seededUserIds: Record<string, string> = {};
const createdUserIds: string[] = [];
let institutionId: string;
let otherInstitutionId: string;
let otherUserId: string;
let departmentId: string;

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
  const email = `user.${emailKey}.${stamp}@nexesis.edu`;
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
      name: "User Route Test",
      slug: `user-route-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

  const other = await prisma.institution.create({
    data: {
      name: "User Route Other",
      slug: `user-route-other-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  otherInstitutionId = other.id;

  const department = await prisma.department.create({
    data: { institutionId, name: "Computer Science", code: `CSC${stamp}`.slice(0, 20) },
  });
  departmentId = department.id;

  // A user in the OTHER institution — must be invisible to our caller.
  otherUserId = await seedUser("student", otherInstitutionId, "foreign");

  for (const role of USER_ROLES) {
    seededUserIds[role] = await seedUser(role, institutionId, role);
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
    const email = `user.${role}.${stamp}@nexesis.edu`;
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
  const allUserIds = [
    ...Object.values(seededUserIds),
    ...createdUserIds,
    otherUserId,
  ];
  await prisma.session.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: allUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  await prisma.institution.deleteMany({
    where: { id: { in: [institutionId, otherInstitutionId] } },
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("User routes — authentication gate", () => {
  it.runIf(dbAvailable)("rejects unauthenticated list (401)", async () => {
    const { status, json } = await req("GET", "/users");
    expect(status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });
});

describe("User routes — create authorization (admin only)", () => {
  it.runIf(dbAvailable)(
    "forbids POST /users for every non-admin role (403)",
    async () => {
      for (const role of USER_ROLES.filter((r) => r !== "admin")) {
        const { status } = await req("POST", "/users", cookies[role], {
          email: `blocked.${role}.${stamp}@nexesis.edu`,
          password: PASSWORD,
          firstName: "Blocked",
          lastName: role,
          role: "student",
        });
        expect(status, `role=${role}`).toBe(403);
      }
    },
  );

  it.runIf(dbAvailable)(
    "allows admin to create a user with an assigned role and department (201)",
    async () => {
      const email = `created.${stamp}@nexesis.edu`;
      const { status, json } = await req("POST", "/users", cookies.admin, {
        email,
        password: PASSWORD,
        firstName: "Created",
        lastName: "User",
        role: "supervisor",
        departmentId,
      });
      expect(status).toBe(201);
      expect(json.data.role).toBe("supervisor");
      expect(json.data.departmentId).toBe(departmentId);
      expect(json.data.institutionId).toBe(institutionId);
      expect(json.data).not.toHaveProperty("password");
      createdUserIds.push(json.data.id);
    },
  );

  it.runIf(dbAvailable)("rejects a duplicate email (409)", async () => {
    const { status, json } = await req("POST", "/users", cookies.admin, {
      email: `user.student.${stamp}@nexesis.edu`, // already seeded
      password: PASSWORD,
      firstName: "Dup",
      lastName: "User",
      role: "student",
    });
    expect(status).toBe(409);
    expect(json.error.code).toBe("CONFLICT");
  });

  it.runIf(dbAvailable)("rejects a department in another institution (400)", async () => {
    const otherDept = await prisma.department.create({
      data: { institutionId: otherInstitutionId, name: "Foreign", code: `FGN${stamp}`.slice(0, 20) },
    });
    const { status, json } = await req("POST", "/users", cookies.admin, {
      email: `baddept.${stamp}@nexesis.edu`,
      password: PASSWORD,
      firstName: "Bad",
      lastName: "Dept",
      role: "student",
      departmentId: otherDept.id,
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    await prisma.department.deleteMany({ where: { id: otherDept.id } });
  });

  it.runIf(dbAvailable)("rejects an invalid body (400)", async () => {
    const { status, json } = await req("POST", "/users", cookies.admin, {
      email: "not-an-email",
      password: "short",
      firstName: "",
      lastName: "",
      role: "student",
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("User routes — list & filtering (authenticated, tenant-scoped)", () => {
  it.runIf(dbAvailable)("lists users for the institution", async () => {
    const { status, json } = await req("GET", "/users", cookies.coordinator);
    expect(status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    // The foreign-institution user must not appear.
    expect(json.data.map((u: any) => u.id)).not.toContain(otherUserId);
  });

  it.runIf(dbAvailable)("filters by role", async () => {
    const { status, json } = await req(
      "GET",
      "/users?role=admin",
      cookies.admin,
    );
    expect(status).toBe(200);
    expect(json.data.every((u: any) => u.role === "admin")).toBe(true);
  });

  it.runIf(dbAvailable)("searches by email", async () => {
    const { status, json } = await req(
      "GET",
      `/users?search=user.coordinator.${stamp}`,
      cookies.admin,
    );
    expect(status).toBe(200);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data.map((u: any) => u.id)).toContain(
      seededUserIds.coordinator,
    );
  });
});

describe("User routes — get by id (role-specific data, tenant isolation)", () => {
  it.runIf(dbAvailable)("returns a user with roleData", async () => {
    const { status, json } = await req(
      "GET",
      `/users/${seededUserIds.student}`,
      cookies.admin,
    );
    expect(status).toBe(200);
    expect(json.data.id).toBe(seededUserIds.student);
    expect(Array.isArray(json.data.roleData.projects)).toBe(true);
    expect(Array.isArray(json.data.roleData.supervisedProjects)).toBe(true);
    expect(json.data).not.toHaveProperty("mfaSecret");
  });

  it.runIf(dbAvailable)(
    "returns 404 for a user in another institution (tenant isolation)",
    async () => {
      const { status, json } = await req(
        "GET",
        `/users/${otherUserId}`,
        cookies.admin,
      );
      expect(status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    },
  );
});

describe("User routes — update (admin or self)", () => {
  it.runIf(dbAvailable)("lets a user update their own profile", async () => {
    const { status, json } = await req(
      "PATCH",
      `/users/${seededUserIds.student}`,
      cookies.student,
      { firstName: "SelfEdited" },
    );
    expect(status).toBe(200);
    expect(json.data.firstName).toBe("SelfEdited");
  });

  it.runIf(dbAvailable)(
    "forbids a user updating another user (403)",
    async () => {
      const { status } = await req(
        "PATCH",
        `/users/${seededUserIds.supervisor}`,
        cookies.student,
        { firstName: "Hacked" },
      );
      expect(status).toBe(403);
    },
  );

  it.runIf(dbAvailable)(
    "forbids a non-admin from changing their own role (403)",
    async () => {
      const { status } = await req(
        "PATCH",
        `/users/${seededUserIds.student}`,
        cookies.student,
        { role: "admin" },
      );
      expect(status).toBe(403);
    },
  );

  it.runIf(dbAvailable)("lets an admin change a user's role", async () => {
    const { status, json } = await req(
      "PATCH",
      `/users/${seededUserIds.examiner}`,
      cookies.admin,
      { role: "hod" },
    );
    expect(status).toBe(200);
    expect(json.data.role).toBe("hod");
    // restore
    await req(
      "PATCH",
      `/users/${seededUserIds.examiner}`,
      cookies.admin,
      { role: "examiner" },
    );
  });
});

describe("User routes — suspend (admin only)", () => {
  it.runIf(dbAvailable)(
    "forbids a non-admin from suspending (403)",
    async () => {
      const { status } = await req(
        "DELETE",
        `/users/${seededUserIds.supervisor}`,
        cookies.coordinator,
      );
      expect(status).toBe(403);
    },
  );

  it.runIf(dbAvailable)(
    "suspends a user (status → suspended, row retained)",
    async () => {
      const email = `suspendme.${stamp}@nexesis.edu`;
      const created = await req("POST", "/users", cookies.admin, {
        email,
        password: PASSWORD,
        firstName: "Suspend",
        lastName: "Me",
        role: "student",
      });
      expect(created.status).toBe(201);
      const id = created.json.data.id;
      createdUserIds.push(id);

      const { status, json } = await req(
        "DELETE",
        `/users/${id}`,
        cookies.admin,
      );
      expect(status).toBe(200);
      expect(json.data.status).toBe("suspended");

      // Row retained (soft delete).
      const stillThere = await prisma.user.findUnique({ where: { id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.status).toBe("suspended");
    },
  );
});
