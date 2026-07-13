import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { DepartmentService } from "../../server/services/department.service";
import { ConflictError, NotFoundError } from "../../server/lib/http";

/**
 * Unit tests for DepartmentService. The Prisma client is fully mocked so the
 * service's own logic (tenant scoping, code-uniqueness-within-institution →
 * conflict, the active-project delete guard, and the getById aggregate stats)
 * is exercised in isolation (mirrors the InstitutionService tests).
 */

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_INSTITUTION_ID = "22222222-2222-2222-2222-222222222222";
const DEPARTMENT_ID = "33333333-3333-3333-3333-333333333333";

const baseRow = {
  id: DEPARTMENT_ID,
  institutionId: INSTITUTION_ID,
  name: "Computer Science",
  code: "CSC",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function makePrisma() {
  return {
    department: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: { count: vi.fn() },
    project: { count: vi.fn() },
  } as unknown as PrismaClient & {
    department: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    user: { count: ReturnType<typeof vi.fn> };
    project: { count: ReturnType<typeof vi.fn> };
  };
}

let prisma: ReturnType<typeof makePrisma>;
let service: DepartmentService;

beforeEach(() => {
  prisma = makePrisma();
  service = new DepartmentService(prisma);
});

describe("DepartmentService.create", () => {
  it("creates a department scoped to the caller's institution", async () => {
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.create.mockResolvedValue(baseRow);

    const result = await service.create(INSTITUTION_ID, {
      name: "Computer Science",
      code: "CSC",
    });

    expect(prisma.department.create).toHaveBeenCalledWith({
      data: { institutionId: INSTITUTION_ID, name: "Computer Science", code: "CSC" },
    });
    expect(result.institutionId).toBe(INSTITUTION_ID);
    expect(result.code).toBe("CSC");
  });

  it("rejects a duplicate code within the same institution (409)", async () => {
    prisma.department.findFirst.mockResolvedValue(baseRow);

    await expect(
      service.create(INSTITUTION_ID, { name: "Comp Sci", code: "CSC" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(prisma.department.create).not.toHaveBeenCalled();
  });

  it("checks code uniqueness case-insensitively within the institution", async () => {
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.create.mockResolvedValue(baseRow);

    await service.create(INSTITUTION_ID, { name: "Comp Sci", code: "csc" });

    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        institutionId: INSTITUTION_ID,
        code: { equals: "csc", mode: "insensitive" },
      },
    });
  });

  it("maps a DB unique violation (P2002) to ConflictError — closes the TOCTOU race", async () => {
    // The precheck passes (concurrent create slipped in), but the database's
    // unique constraint rejects the write; it must surface as a 409, not a 500.
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    await expect(
      service.create(INSTITUTION_ID, { name: "Comp Sci", code: "CSC" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("DepartmentService.list", () => {
  it("scopes to the institution and paginates", async () => {
    prisma.department.findMany.mockResolvedValue([baseRow]);
    prisma.department.count.mockResolvedValue(1);

    const result = await service.list(INSTITUTION_ID, { page: 2, limit: 10 });

    expect(prisma.department.findMany).toHaveBeenCalledWith({
      where: { institutionId: INSTITUTION_ID },
      orderBy: { createdAt: "desc" },
      skip: 10,
      take: 10,
    });
    expect(result.total).toBe(1);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it("defaults to page 1, limit 20 when omitted", async () => {
    prisma.department.findMany.mockResolvedValue([]);
    prisma.department.count.mockResolvedValue(0);

    const result = await service.list(INSTITUTION_ID, {});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(prisma.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });
});

describe("DepartmentService.getById", () => {
  it("returns the department with user count and project stats", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.user.count.mockResolvedValue(7);
    prisma.project.count
      .mockResolvedValueOnce(5) // total
      .mockResolvedValueOnce(3); // active

    const result = await service.getById(INSTITUTION_ID, DEPARTMENT_ID);

    expect(result.userCount).toBe(7);
    expect(result.projectStats).toEqual({ total: 5, active: 3 });
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { departmentId: DEPARTMENT_ID, archivedAt: null },
    });
  });

  it("throws NotFoundError for an unknown id", async () => {
    prisma.department.findUnique.mockResolvedValue(null);

    await expect(
      service.getById(INSTITUTION_ID, DEPARTMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats a department in another institution as not found", async () => {
    prisma.department.findUnique.mockResolvedValue({
      ...baseRow,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.getById(INSTITUTION_ID, DEPARTMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("DepartmentService.update", () => {
  it("updates only the provided fields", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.department.update.mockResolvedValue({ ...baseRow, name: "Renamed" });

    await service.update(INSTITUTION_ID, DEPARTMENT_ID, { name: "Renamed" });

    expect(prisma.department.update).toHaveBeenCalledWith({
      where: { id: DEPARTMENT_ID },
      data: { name: "Renamed" },
    });
    // No code change → no uniqueness lookup.
    expect(prisma.department.findFirst).not.toHaveBeenCalled();
  });

  it("allows a code change that does not collide (excludes itself)", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.update.mockResolvedValue({ ...baseRow, code: "CS" });

    await service.update(INSTITUTION_ID, DEPARTMENT_ID, { code: "CS" });

    expect(prisma.department.findFirst).toHaveBeenCalledWith({
      where: {
        institutionId: INSTITUTION_ID,
        code: { equals: "CS", mode: "insensitive" },
        id: { not: DEPARTMENT_ID },
      },
    });
  });

  it("rejects a code change that collides with another department (409)", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.department.findFirst.mockResolvedValue({ ...baseRow, id: "other" });

    await expect(
      service.update(INSTITUTION_ID, DEPARTMENT_ID, { code: "MEE" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(prisma.department.update).not.toHaveBeenCalled();
  });

  it("maps a DB unique violation (P2002) on update to ConflictError", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.department.findFirst.mockResolvedValue(null); // precheck passes
    prisma.department.update.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    await expect(
      service.update(INSTITUTION_ID, DEPARTMENT_ID, { code: "MEE" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("throws NotFoundError when the department is not in the institution", async () => {
    prisma.department.findUnique.mockResolvedValue({
      ...baseRow,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.update(INSTITUTION_ID, DEPARTMENT_ID, { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("DepartmentService.delete", () => {
  it("deletes when there are no active projects", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.project.count.mockResolvedValue(0);
    prisma.department.delete.mockResolvedValue(baseRow);

    await service.delete(INSTITUTION_ID, DEPARTMENT_ID);

    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { departmentId: DEPARTMENT_ID, archivedAt: null },
    });
    expect(prisma.department.delete).toHaveBeenCalledWith({
      where: { id: DEPARTMENT_ID },
    });
  });

  it("refuses to delete a department with active projects (409)", async () => {
    prisma.department.findUnique.mockResolvedValue(baseRow);
    prisma.project.count.mockResolvedValue(2);

    await expect(
      service.delete(INSTITUTION_ID, DEPARTMENT_ID),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(prisma.department.delete).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the department is not in the institution", async () => {
    prisma.department.findUnique.mockResolvedValue(null);

    await expect(
      service.delete(INSTITUTION_ID, DEPARTMENT_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.department.delete).not.toHaveBeenCalled();
  });
});
