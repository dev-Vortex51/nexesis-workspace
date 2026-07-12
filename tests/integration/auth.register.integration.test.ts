import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "../../server/index";
import { prisma } from "../../server/lib/prisma";

/**
 * Integration tests for POST /auth/register access control.
 *
 * Registration is admin-only and institution-scoped (see API spec). These
 * tests drive the real Express app against the database to prove the guards
 * hold end-to-end: anonymous callers cannot self-register (and thus cannot
 * mint an admin), non-admins are rejected, admins cannot provision into other
 * institutions, and a successful registration establishes NO session cookie.
 *
 * Skips automatically when the database is unreachable so unit runs stay green
 * in environments without Postgres.
 */

let server: Server;
let baseUrl: string;

// Detect Postgres availability before collection. `it.runIf(dbAvailable)` is
// evaluated while the describe block is collected — which happens before any
// beforeAll runs — so the probe must complete at module-init (top-level await),
// otherwise runIf would always see the initial value and never skip.
const dbAvailable = await (async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
})();

const created: {
  institutionA?: string;
  institutionB?: string;
  adminId?: string;
  studentId?: string;
  extraUserIds: string[];
} = { extraUserIds: [] };

const ADMIN_EMAIL = `admin.acl.${Date.now()}@nexesis.edu`;
const STUDENT_EMAIL = `student.acl.${Date.now()}@nexesis.edu`;
const PASSWORD = "password1234";

async function post(path: string, body: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return { res, json: (await res.json()) as any };
}

/** Register a user directly via Better Auth (bypassing the guarded route) so
 *  we have seed accounts (an admin, a student) to authenticate as. */
async function seedUser(
  email: string,
  role: string,
  institutionId: string,
): Promise<string> {
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `Seed ${role}`,
      firstName: "Seed",
      lastName: role,
      role,
      institutionId,
    } as never,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return user.id;
}

async function loginCookie(email: string): Promise<string> {
  const { res } = await post("/api/v1/auth/login", { email, password: PASSWORD });
  return (res.headers.get("set-cookie") ?? "").split(";")[0];
}

beforeAll(async () => {
  // The database probe ran at module init (see dbAvailable). Skip all
  // database-dependent setup when Postgres is unreachable.
  if (!dbAvailable) return;

  const instA = await prisma.institution.create({
    data: {
      name: "ACL Institution A",
      slug: `acl-a-${Date.now()}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  const instB = await prisma.institution.create({
    data: {
      name: "ACL Institution B",
      slug: `acl-b-${Date.now()}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  created.institutionA = instA.id;
  created.institutionB = instB.id;

  created.adminId = await seedUser(ADMIN_EMAIL, "admin", instA.id);
  created.studentId = await seedUser(STUDENT_EMAIL, "student", instA.id);

  server = createServer().listen(0);
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  if (!dbAvailable) return;
  const userIds = [
    created.adminId,
    created.studentId,
    ...created.extraUserIds,
  ].filter(Boolean) as string[];
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.account.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.institution.deleteMany({
    where: {
      id: { in: [created.institutionA, created.institutionB].filter(Boolean) as string[] },
    },
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("POST /auth/register access control", () => {
  it.runIf(dbAvailable)(
    "rejects an anonymous caller trying to create an admin (401)",
    async () => {
      const { res, json } = await post("/api/v1/auth/register", {
        email: `attacker.${Date.now()}@evil.com`,
        password: PASSWORD,
        firstName: "Mal",
        lastName: "Ory",
        role: "admin",
        institutionId: created.institutionA,
      });

      expect(res.status).toBe(401);
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(res.headers.get("set-cookie")).toBeNull();

      // and no such user was created
      const leaked = await prisma.user.findFirst({
        where: { role: "admin", email: { contains: "@evil.com" } },
      });
      expect(leaked).toBeNull();
    },
  );

  it.runIf(dbAvailable)(
    "rejects a non-admin (student) caller (403)",
    async () => {
      const cookie = await loginCookie(STUDENT_EMAIL);
      const { res, json } = await post(
        "/api/v1/auth/register",
        {
          email: `nope.${Date.now()}@nexesis.edu`,
          password: PASSWORD,
          firstName: "No",
          lastName: "Pe",
          role: "student",
          institutionId: created.institutionA,
        },
        cookie,
      );

      expect(res.status).toBe(403);
      expect(json.error.code).toBe("FORBIDDEN");
    },
  );

  it.runIf(dbAvailable)(
    "rejects an admin provisioning into another institution (403)",
    async () => {
      const cookie = await loginCookie(ADMIN_EMAIL);
      const { res, json } = await post(
        "/api/v1/auth/register",
        {
          email: `crosstenant.${Date.now()}@nexesis.edu`,
          password: PASSWORD,
          firstName: "Cross",
          lastName: "Tenant",
          role: "student",
          institutionId: created.institutionB, // not the admin's institution
        },
        cookie,
      );

      expect(res.status).toBe(403);
      expect(json.error.code).toBe("FORBIDDEN");
    },
  );

  it.runIf(dbAvailable)(
    "allows an admin to register a user in their own institution, without a session cookie",
    async () => {
      const cookie = await loginCookie(ADMIN_EMAIL);
      const email = `newuser.${Date.now()}@nexesis.edu`;
      const { res, json } = await post(
        "/api/v1/auth/register",
        {
          email,
          password: PASSWORD,
          firstName: "New",
          lastName: "User",
          role: "supervisor",
          institutionId: created.institutionA,
        },
        cookie,
      );

      expect(res.status).toBe(201);
      expect(json.success).toBe(true);
      expect(json.data.email).toBe(email);
      // Registration must NOT establish a session for anyone.
      expect(res.headers.get("set-cookie")).toBeNull();

      const newUser = await prisma.user.findUnique({ where: { email } });
      expect(newUser).not.toBeNull();
      created.extraUserIds.push(newUser!.id);
    },
  );
});
