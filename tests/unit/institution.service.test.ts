import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { InstitutionService } from "../../server/services/institution.service";
import { ConflictError, NotFoundError } from "../../server/lib/http";
import type {
  CreateInstitutionRequest,
  UpdateInstitutionRequest,
} from "../../shared/schemas/institution";

/**
 * Unit tests for InstitutionService. The Prisma client is fully mocked so the
 * service's own logic (subscriptionTier defaulting, unique-slug → conflict
 * mapping, the dedicated-column soft-delete with atomic conditional writes, and
 * the reserved-key stripping) is exercised in isolation (mirrors the AuthService
 * tests).
 */

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";

const baseRow = {
  id: INSTITUTION_ID,
  name: "Nexesis University",
  slug: "nexesis-university",
  logoUrl: null as string | null,
  settings: {} as Record<string, unknown>,
  subscriptionTier: "free",
  deletedAt: null as Date | null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const createInput: CreateInstitutionRequest = {
  name: "Nexesis University",
  slug: "nexesis-university",
};

function makePrisma() {
  return {
    institution: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  } as unknown as PrismaClient & {
    institution: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
}

/** A Prisma P2002 unique-constraint violation, as thrown by the client. */
function uniqueViolation() {
  return Object.assign(new Error("Unique constraint failed"), {
    code: "P2002",
    meta: { target: ["slug"] },
  });
}

/** A Prisma P2025 "record to update not found" error. */
function recordNotFound() {
  return Object.assign(new Error("Record to update not found"), {
    code: "P2025",
  });
}

let prisma: ReturnType<typeof makePrisma>;
let service: InstitutionService;

beforeEach(() => {
  prisma = makePrisma();
  service = new InstitutionService(prisma);
});

describe("InstitutionService.create", () => {
  it("defaults subscriptionTier to 'free' and defaults empty settings", async () => {
    prisma.institution.create.mockResolvedValue(baseRow);

    const result = await service.create(createInput);

    expect(prisma.institution.create).toHaveBeenCalledWith({
      data: {
        name: "Nexesis University",
        slug: "nexesis-university",
        settings: {},
        subscriptionTier: "free",
      },
    });
    expect(result.subscriptionTier).toBe("free");
    expect(result.settings).toEqual({});
  });

  it("persists the provided settings object", async () => {
    const settings = { theme: "dark", maxProjects: 10 };
    prisma.institution.create.mockResolvedValue({ ...baseRow, settings });

    const result = await service.create({ ...createInput, settings });

    expect(prisma.institution.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ settings }),
      }),
    );
    expect(result.settings).toEqual(settings);
  });

  it("strips a reserved _deletedAt key before persisting settings", async () => {
    prisma.institution.create.mockResolvedValue(baseRow);

    await service.create({
      ...createInput,
      settings: { theme: "dark", _deletedAt: "2026-02-01T00:00:00Z" } as never,
    });

    const call = prisma.institution.create.mock.calls[0][0];
    expect(call.data.settings).toEqual({ theme: "dark" });
    expect(call.data.settings).not.toHaveProperty("_deletedAt");
  });

  it("maps a duplicate-slug P2002 violation to ConflictError", async () => {
    prisma.institution.create.mockRejectedValue(uniqueViolation());

    await expect(service.create(createInput)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("rethrows non-unique errors unchanged", async () => {
    const boom = new Error("connection reset");
    prisma.institution.create.mockRejectedValue(boom);

    await expect(service.create(createInput)).rejects.toBe(boom);
  });
});

describe("InstitutionService.getById", () => {
  it("returns a live institution (filtered on deletedAt: null)", async () => {
    prisma.institution.findFirst.mockResolvedValue(baseRow);

    const result = await service.getById(INSTITUTION_ID);

    expect(result.id).toBe(INSTITUTION_ID);
    expect(prisma.institution.findFirst).toHaveBeenCalledWith({
      where: { id: INSTITUTION_ID, deletedAt: null },
    });
  });

  it("throws NotFoundError when no live row matches", async () => {
    prisma.institution.findFirst.mockResolvedValue(null);

    await expect(service.getById(INSTITUTION_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("strips a reserved key that somehow lingers in stored settings", async () => {
    prisma.institution.findFirst.mockResolvedValue({
      ...baseRow,
      settings: { theme: "light", _deletedAt: "x" },
    });

    const result = await service.getById(INSTITUTION_ID);

    expect(result.settings).toEqual({ theme: "light" });
    expect(result.settings).not.toHaveProperty("_deletedAt");
  });
});

describe("InstitutionService.list", () => {
  it("filters and paginates live rows in the database", async () => {
    prisma.institution.findMany.mockResolvedValue([
      { ...baseRow, id: "a", slug: "a" },
      { ...baseRow, id: "c", slug: "c" },
    ]);
    prisma.institution.count.mockResolvedValue(2);

    const result = await service.list({ page: 1, limit: 20 });

    expect(prisma.institution.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip: 0,
      take: 20,
    });
    expect(prisma.institution.count).toHaveBeenCalledWith({
      where: { deletedAt: null },
    });
    expect(result.total).toBe(2);
    expect(result.institutions.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("applies page/limit windowing (skip/take)", async () => {
    prisma.institution.findMany.mockResolvedValue([]);
    prisma.institution.count.mockResolvedValue(5);

    const result = await service.list({ page: 2, limit: 2 });

    expect(prisma.institution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 2, take: 2 }),
    );
    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
  });

  it("defaults to page 1, limit 20 when omitted", async () => {
    prisma.institution.findMany.mockResolvedValue([baseRow]);
    prisma.institution.count.mockResolvedValue(1);

    const result = await service.list({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.institutions).toHaveLength(1);
  });
});

describe("InstitutionService.update", () => {
  it("updates only the provided fields, conditional on the row being live", async () => {
    prisma.institution.update.mockResolvedValue({ ...baseRow, name: "Renamed" });

    await service.update(INSTITUTION_ID, { name: "Renamed" });

    expect(prisma.institution.update).toHaveBeenCalledWith({
      where: { id: INSTITUTION_ID, deletedAt: null },
      data: { name: "Renamed" },
    });
  });

  it("strips a reserved _deletedAt key from replaced settings", async () => {
    prisma.institution.update.mockResolvedValue(baseRow);

    await service.update(INSTITUTION_ID, {
      settings: { a: 1, _deletedAt: "x" } as never,
    });

    const call = prisma.institution.update.mock.calls[0][0];
    expect(call.data.settings).toEqual({ a: 1 });
    expect(call.data.settings).not.toHaveProperty("_deletedAt");
  });

  it("throws NotFoundError when the row is missing or already deleted (P2025)", async () => {
    prisma.institution.update.mockRejectedValue(recordNotFound());

    await expect(
      service.update(INSTITUTION_ID, { name: "X" } as UpdateInstitutionRequest),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a duplicate-slug P2002 violation to ConflictError", async () => {
    prisma.institution.update.mockRejectedValue(uniqueViolation());

    await expect(
      service.update(INSTITUTION_ID, { slug: "taken" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("InstitutionService.softDelete", () => {
  it("stamps deletedAt atomically, only while the row is live", async () => {
    prisma.institution.updateMany.mockResolvedValue({ count: 1 });

    await service.softDelete(INSTITUTION_ID);

    const call = prisma.institution.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: INSTITUTION_ID, deletedAt: null });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it("throws NotFoundError when no live row is affected (unknown or already deleted)", async () => {
    prisma.institution.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.softDelete(INSTITUTION_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
