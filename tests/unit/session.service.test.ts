import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { SessionService } from "../../server/services/session.service";
import { ConflictError, NotFoundError } from "../../server/lib/http";

/**
 * Unit tests for SessionService. The Prisma client is fully mocked so the
 * service's own logic (tenant scoping, create defaults, the getById aggregate
 * stats + completion rate, the activate transition that closes the previous
 * active session, and close) is exercised in isolation (mirrors the
 * DepartmentService tests).
 */

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_INSTITUTION_ID = "22222222-2222-2222-2222-222222222222";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";

const baseRow = {
  id: SESSION_ID,
  institutionId: INSTITUTION_ID,
  name: "2025/2026 Session",
  startDate: new Date("2025-09-01T00:00:00Z"),
  endDate: new Date("2026-08-31T00:00:00Z"),
  status: "planning" as const,
  settings: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function makePrisma() {
  return {
    academicSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    project: { count: vi.fn() },
    $transaction: vi.fn(),
  } as unknown as PrismaClient & {
    academicSession: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    project: { count: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

let prisma: ReturnType<typeof makePrisma>;
let service: SessionService;

beforeEach(() => {
  prisma = makePrisma();
  service = new SessionService(prisma);
  // Default: $transaction runs the given operation promises and returns their
  // resolved values (matches Prisma's array form).
  prisma.$transaction.mockImplementation((ops: Promise<unknown>[]) =>
    Promise.all(ops),
  );
});

describe("SessionService.create", () => {
  it("creates a session in 'planning' scoped to the institution", async () => {
    prisma.academicSession.create.mockResolvedValue(baseRow);

    const result = await service.create(INSTITUTION_ID, {
      name: "2025/2026 Session",
      startDate: baseRow.startDate,
      endDate: baseRow.endDate,
    });

    expect(prisma.academicSession.create).toHaveBeenCalledWith({
      data: {
        institutionId: INSTITUTION_ID,
        name: "2025/2026 Session",
        startDate: baseRow.startDate,
        endDate: baseRow.endDate,
        status: "planning",
        settings: {},
      },
    });
    expect(result.institutionId).toBe(INSTITUTION_ID);
    expect(result.status).toBe("planning");
  });

  it("passes settings through and defaults to {} when omitted", async () => {
    prisma.academicSession.create.mockResolvedValue({
      ...baseRow,
      settings: { topicProposalDeadline: "2025-10-01" },
    });

    await service.create(INSTITUTION_ID, {
      name: "S",
      startDate: baseRow.startDate,
      endDate: baseRow.endDate,
      settings: { topicProposalDeadline: "2025-10-01" },
    });

    expect(prisma.academicSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          settings: { topicProposalDeadline: "2025-10-01" },
        }),
      }),
    );
  });

  it("maps a duplicate name (P2002) to a ConflictError", async () => {
    prisma.academicSession.create.mockRejectedValue({ code: "P2002" });

    await expect(
      service.create(INSTITUTION_ID, {
        name: "Dup",
        startDate: baseRow.startDate,
        endDate: baseRow.endDate,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("SessionService.list", () => {
  it("scopes to the institution and paginates", async () => {
    prisma.academicSession.findMany.mockResolvedValue([baseRow]);
    prisma.academicSession.count.mockResolvedValue(1);

    const result = await service.list(INSTITUTION_ID, { page: 2, limit: 10 });

    expect(prisma.academicSession.findMany).toHaveBeenCalledWith({
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
    prisma.academicSession.findMany.mockResolvedValue([]);
    prisma.academicSession.count.mockResolvedValue(0);

    const result = await service.list(INSTITUTION_ID, {});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(prisma.academicSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
  });
});

describe("SessionService.getById", () => {
  it("returns the session with project counts and completion rate", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(baseRow);
    prisma.project.count
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(8) // active
      .mockResolvedValueOnce(4); // completed

    const result = await service.getById(INSTITUTION_ID, SESSION_ID);

    expect(result.projectCounts).toEqual({ total: 10, active: 8, completed: 4 });
    expect(result.completionRate).toBe(40);
    expect(prisma.project.count).toHaveBeenCalledWith({
      where: { sessionId: SESSION_ID, completedAt: { not: null } },
    });
  });

  it("reports a 0 completion rate when there are no projects", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(baseRow);
    prisma.project.count.mockResolvedValue(0);

    const result = await service.getById(INSTITUTION_ID, SESSION_ID);

    expect(result.completionRate).toBe(0);
    expect(result.projectCounts).toEqual({ total: 0, active: 0, completed: 0 });
  });

  it("throws NotFoundError for an unknown id", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(null);

    await expect(
      service.getById(INSTITUTION_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats a session in another institution as not found", async () => {
    prisma.academicSession.findUnique.mockResolvedValue({
      ...baseRow,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.getById(INSTITUTION_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("SessionService.update", () => {
  it("updates only the provided fields and never touches status", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(baseRow);
    prisma.academicSession.update.mockResolvedValue({
      ...baseRow,
      name: "Renamed",
    });

    await service.update(INSTITUTION_ID, SESSION_ID, { name: "Renamed" });

    expect(prisma.academicSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { name: "Renamed" },
    });
  });

  it("throws NotFoundError when the session is not in the institution", async () => {
    prisma.academicSession.findUnique.mockResolvedValue({
      ...baseRow,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.update(INSTITUTION_ID, SESSION_ID, { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a duplicate name (P2002) to a ConflictError", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(baseRow);
    prisma.academicSession.update.mockRejectedValue({ code: "P2002" });

    await expect(
      service.update(INSTITUTION_ID, SESSION_ID, { name: "Dup" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("SessionService.activate", () => {
  it("activates the session and closes other active sessions in the institution", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(baseRow);
    prisma.academicSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.academicSession.update.mockResolvedValue({
      ...baseRow,
      status: "active",
    });

    const result = await service.activate(INSTITUTION_ID, SESSION_ID);

    expect(prisma.academicSession.updateMany).toHaveBeenCalledWith({
      where: { institutionId: INSTITUTION_ID, status: "active", id: { not: SESSION_ID } },
      data: { status: "closed" },
    });
    expect(prisma.academicSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { status: "active" },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(result.status).toBe("active");
  });

  it("throws NotFoundError when the session is not in the institution", async () => {
    prisma.academicSession.findUnique.mockResolvedValue(null);

    await expect(
      service.activate(INSTITUTION_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("SessionService.close", () => {
  it("sets the session status to closed", async () => {
    prisma.academicSession.findUnique.mockResolvedValue({
      ...baseRow,
      status: "active",
    });
    prisma.academicSession.update.mockResolvedValue({
      ...baseRow,
      status: "closed",
    });

    const result = await service.close(INSTITUTION_ID, SESSION_ID);

    expect(prisma.academicSession.update).toHaveBeenCalledWith({
      where: { id: SESSION_ID },
      data: { status: "closed" },
    });
    expect(result.status).toBe("closed");
  });

  it("throws NotFoundError when the session is not in the institution", async () => {
    prisma.academicSession.findUnique.mockResolvedValue({
      ...baseRow,
      institutionId: OTHER_INSTITUTION_ID,
    });

    await expect(
      service.close(INSTITUTION_ID, SESSION_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(prisma.academicSession.update).not.toHaveBeenCalled();
  });
});
