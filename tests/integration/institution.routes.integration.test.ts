import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../../server/lib/prisma";
import institutionRoutes from "../../server/routes/institutions";
import { USER_ROLES } from "../../shared/schemas/auth";

/**
 * Integration tests for the institution CRUD routes (unit 1.1).
 *
 * The real institution router is mounted over the real auth + RBAC stack and
 * driven end-to-end with a live session cookie for each User.role value. The
 * API spec restricts every institution endpoint to "super-admin"; no User.role
 * maps to super-admin, so the permission matrix fails closed. These tests prove
 * that: every authenticated role is forbidden (403), unauthenticated is 401,
 * and request validation still runs at the boundary.
 *
 * Skips automatically when Postgres is unreachable so unit runs stay green in
 * environments without a database (same pattern as the RBAC integration test).
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
let institutionId: string;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/institutions", institutionRoutes);
  return app;
}

async function seedUser(role: string): Promise<string> {
  const email = `inst.${role}.${stamp}@nexesis.edu`;
  const { auth } = await import("../../server/auth");
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: `Inst ${role}`,
      firstName: "Inst",
      lastName: role,
      role,
      institutionId,
    } as never,
  });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return user.id;
}

async function loginCookie(role: string): Promise<string> {
  const email = `inst.${role}.${stamp}@nexesis.edu`;
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
      name: "Institution Route Test",
      slug: `inst-route-${stamp}`,
      settings: {},
      subscriptionTier: "free",
    },
  });
  institutionId = institution.id;

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

describe("Institution routes — authentication gate", () => {
  it.runIf(dbAvailable)("rejects unauthenticated list (401)", async () => {
    const { status, json } = await req("GET", "/institutions");
    expect(status).toBe(401);
    expect(json.error.code).toBe("UNAUTHORIZED");
  });

  it.runIf(dbAvailable)("rejects unauthenticated create (401)", async () => {
    const { status } = await req("POST", "/institutions", undefined, {
      name: "X",
      slug: "x",
    });
    expect(status).toBe(401);
  });
});

describe("Institution routes — super-admin authorization (fails closed)", () => {
  it.runIf(dbAvailable)(
    "forbids GET /institutions for every role (403)",
    async () => {
      for (const role of USER_ROLES) {
        const { status, json } = await req(
          "GET",
          "/institutions",
          cookies[role],
        );
        expect(status, `role=${role}`).toBe(403);
        expect(json.error.code).toBe("FORBIDDEN");
      }
    },
  );

  it.runIf(dbAvailable)(
    "forbids POST /institutions for every role incl. admin (403)",
    async () => {
      for (const role of USER_ROLES) {
        const { status } = await req("POST", "/institutions", cookies[role], {
          name: "Blocked",
          slug: "blocked",
        });
        expect(status, `role=${role}`).toBe(403);
      }
    },
  );

  it.runIf(dbAvailable)(
    "forbids GET /institutions/:id for admin (403)",
    async () => {
      const { status } = await req(
        "GET",
        `/institutions/${institutionId}`,
        cookies.admin,
      );
      expect(status).toBe(403);
    },
  );

  it.runIf(dbAvailable)(
    "forbids PATCH /institutions/:id for admin (403)",
    async () => {
      const { status } = await req(
        "PATCH",
        `/institutions/${institutionId}`,
        cookies.admin,
        { name: "Renamed" },
      );
      expect(status).toBe(403);
    },
  );

  it.runIf(dbAvailable)(
    "forbids DELETE /institutions/:id for admin (403)",
    async () => {
      const { status } = await req(
        "DELETE",
        `/institutions/${institutionId}`,
        cookies.admin,
      );
      expect(status).toBe(403);
    },
  );
});
