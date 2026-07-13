import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Auth } from "../../server/auth";
import { UserService } from "../../server/services/user.service";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../server/lib/http";

/**
 * Unit tests for UserService. Both Better Auth and the Prisma client are fully
 * mocked so the service's own logic is exercised in isolation (mirrors the
 * DepartmentService tests): tenant scoping, the spec's list filters, admin-only
 * role/status changes, department-in-institution validation, the create path
 * through Better Auth (incl. duplicate-email → conflict), the role-specific
 * getById data, and the suspend (soft-delete) behaviour.
 */

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_INSTITUTION_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";
const DEPARTMENT_ID = "44444444-4444-4444-4444-444444444444";

const baseUser = {
  id: USER_ID,
  email: "jane@nexesis.edu",
  firstName: "Jane",
  lastName: "Doe",
  role: "student",
  institutionId: INSTITUTION_ID,
  departmentId: null as string | null,
  status: "active",
  mfaEnabled: false,
  emailVerified: false,
  lastLoginAt: null as Date | null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

function makePrisma() {
  return {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    project: { findMany: vi.fn() },
    projectMember: { findMany: vi.fn() },
    department: { findUnique: vi.fn() },
  } as unknown as PrismaClient & {
    user: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    project: { findMany: ReturnType<typeof vi.fn> };
    projectMember: { findMany: ReturnType<typeof vi.fn> };
    department: { findUnique: ReturnType<typeof vi.fn> };
  };
}

function makeAuth() {
  return {
    api: { signUpEmail: vi.fn() },
  } as unknown as Auth & {
    api: { signUpEmail: ReturnType<typeof vi.fn> };
  };
}

let prisma: ReturnType<typeof makePrisma>;
let auth: ReturnType<typeof makeAuth>;
let service: UserService;

beforeEach(() => {
  prisma = makePrisma();
  auth = makeAuth();
  service = new UserService(auth, prisma);
});

describe("UserService.list", () => {
  it("scopes to the institution and paginates, newest first", async () => {
    prisma.user.findMany.mockResolvedValue([baseUser]);
    prisma.user.count.mockResolvedValue(1);

    const result = await service.list(INSTITUTION_ID, { page: 2, limit: 10 });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { institutionId: INSTITUTION_ID },
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    // Never leaks a credential/secret.
    expect(result.users[0]).not.toHaveProperty("password");
    expect(result.users[0]).not.toHaveProperty("mfaSecret");
  });

  it("defaults to page 1, limit 20 when omitted", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    const result = await service.list(INSTITUTION_ID, {});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });

  it("applies role, department and status filters", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.list(INSTITUTION_ID, {
      role: "supervisor",
      departmentId: DEPARTMENT_ID,
      status: "active",
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institutionId: INSTITUTION_ID,
          role: "supervisor",
          departmentId: DEPARTMENT_ID,
          status: "active",
        },
      }),
    );
  });

  it("searches by name or email case-insensitively", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.list(INSTITUTION_ID, { search: "jane" });

    const call = prisma.user.findMany.mock.calls[0][0];
    expect(call.where.institutionId).toBe(INSTITUTION_ID);
    expect(call.where.OR).toEqual([
      { firstName: { contains: "jane", mode: "insensitive" } },
      { lastName: { contains: "jane", mode: "insensitive" } },
      { name: { contains: "jane", mode: "insensitive" } },
      { email: { contains: "jane", mode: "insensitive" } },
    ]);
  });
});

describe("UserService.create", () => {
  it("creates via Better Auth with the admin-assigned role and institution", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      role: "supervisor",
    });
    auth.api.signUpEmail.mockResolvedValue({});

    const result = await service.create(INSTITUTION_ID, {
      email: "sup@nexesis.edu",
      password: "password1234",
      firstName: "Sam",
      lastName: "Prof",
      role: "supervisor",
    });

    expect(auth.api.signUpEmail).toHaveBeenCalledWith({
      body: expect.objectContaining({
        email: "sup@nexesis.edu",
        role: "supervisor",
        institutionId: INSTITUTION_ID,
        departmentId: null,
      }),
    });
    expect(result.role).toBe("supervisor");
    expect(result).not.toHaveProperty("password");
  });

  it("rejects a duplicate email before calling Better Auth (409)", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "existing" });

    await expect(
      service.create(INSTITUTION_ID, {
        email: "taken@nexesis.edu",
        password: "password1234",
        firstName: "Taken",
        lastName: "Email",
        role: "student",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  it("validates the department belongs to the institution", async () => {
    prisma.department.findUnique.mockResolvedValue({
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.create(INSTITUTION_ID, {
        email: "x@nexesis.edu",
        password: "password1234",
        firstName: "X",
        lastName: "Y",
        role: "student",
        departmentId: DEPARTMENT_ID,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(auth.api.signUpEmail).not.toHaveBeenCalled();
  });

  it("maps a duplicate email to a ConflictError", async () => {
    const { APIError } = await import("better-auth/api");
    auth.api.signUpEmail.mockRejectedValue(
      new APIError("UNPROCESSABLE_ENTITY", { message: "User already exists" }),
    );

    await expect(
      service.create(INSTITUTION_ID, {
        email: "dup@nexesis.edu",
        password: "password1234",
        firstName: "Dup",
        lastName: "User",
        role: "student",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("UserService.getById", () => {
  it("returns the user with role-specific project data", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.project.findMany.mockResolvedValue([
      {
        id: "p1",
        title: "Thesis",
        currentStage: "proposal",
        stageStatus: "pending",
        progress: 20,
      },
    ]);
    prisma.projectMember.findMany.mockResolvedValue([]);

    const result = await service.getById(INSTITUTION_ID, USER_ID);

    expect(result.roleData.projects).toHaveLength(1);
    expect(result.roleData.projects[0].id).toBe("p1");
    expect(result.roleData.supervisedProjects).toEqual([]);
  });

  it("surfaces supervised projects from ProjectMember", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, role: "supervisor" });
    prisma.project.findMany.mockResolvedValue([]);
    prisma.projectMember.findMany.mockResolvedValue([
      {
        project: {
          id: "p2",
          title: null,
          currentStage: "chapter_reviews",
          stageStatus: "in_review",
          progress: 55,
        },
      },
    ]);

    const result = await service.getById(INSTITUTION_ID, USER_ID);

    expect(result.roleData.projects).toEqual([]);
    expect(result.roleData.supervisedProjects).toHaveLength(1);
    expect(result.roleData.supervisedProjects[0].id).toBe("p2");
  });

  it("throws NotFoundError for an unknown id", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.getById(INSTITUTION_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats a user in another institution as not found", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.getById(INSTITUTION_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UserService.update", () => {
  it("updates base fields and keeps the composed name in sync", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({ ...baseUser, firstName: "Janet" });

    await service.update(INSTITUTION_ID, USER_ID, { firstName: "Janet" }, false);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { firstName: "Janet", name: "Janet Doe" },
    });
  });

  it("lets an admin change role and status", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({
      ...baseUser,
      role: "supervisor",
      status: "inactive",
    });

    await service.update(
      INSTITUTION_ID,
      USER_ID,
      { role: "supervisor", status: "inactive" },
      true,
    );

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { role: "supervisor", status: "inactive" },
    });
  });

  it("forbids a non-admin (self) from changing role (403)", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(
      service.update(INSTITUTION_ID, USER_ID, { role: "admin" }, false),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("forbids a non-admin (self) from changing status (403)", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(
      service.update(INSTITUTION_ID, USER_ID, { status: "active" }, false),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects a department outside the institution", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.department.findUnique.mockResolvedValue({
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.update(
        INSTITUTION_ID,
        USER_ID,
        { departmentId: DEPARTMENT_ID },
        true,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the user is not in the institution", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...baseUser,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.update(INSTITUTION_ID, USER_ID, { firstName: "X" }, true),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("UserService.suspend", () => {
  it("sets status to suspended (soft delete)", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockResolvedValue({ ...baseUser, status: "suspended" });

    const result = await service.suspend(INSTITUTION_ID, USER_ID);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { status: "suspended" },
    });
    expect(result.status).toBe("suspended");
  });

  it("throws NotFoundError when the user is not in the institution", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      service.suspend(INSTITUTION_ID, USER_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
