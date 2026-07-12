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
 * mapping, the settings-JSONB soft-delete marker, and its exclusion from reads
 * and responses) is exercised in isolation (mirrors the AuthService tests).
 */

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";

const baseRow = {
  id: INSTITUTION_ID,
  name: "Nexesis University",
  slug: "nexesis-university",
  logoUrl: null as string | null,
  settings: {} as Record<string, unknown>,
  subscriptionTier: "free",
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
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaClient & {
    institution: {
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
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
  it("returns a live institution", async () => {
    prisma.institution.findUnique.mockResolvedValue(baseRow);

    const result = await service.getById(INSTITUTION_ID);

    expect(result.id).toBe(INSTITUTION_ID);
    expect(prisma.institution.findUnique).toHaveBeenCalledWith({
      where: { id: INSTITUTION_ID },
    });
  });

  it("throws NotFoundError for an unknown id", async () => {
    prisma.institution.findUnique.mockResolvedValue(null);

    await expect(service.getById(INSTITUTION_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("treats a soft-deleted institution as not found", async () => {
    prisma.institution.findUnique.mockResolvedValue({
      ...baseRow,
      settings: { _deletedAt: "2026-02-01T00:00:00Z" },
    });

    await expect(service.getById(INSTITUTION_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("strips the internal delete marker from the response settings", async () => {
    prisma.institution.findUnique.mockResolvedValue({
      ...baseRow,
      settings: { theme: "light", _internal: true },
    });

    const result = await service.getById(INSTITUTION_ID);

    expect(result.settings).toEqual({ theme: "light", _internal: true });
    expect(result.settings).not.toHaveProperty("_deletedAt");
  });
});

describe("InstitutionService.list", () => {
  it("excludes soft-deleted rows and paginates the live set", async () => {
    prisma.institution.findMany.mockResolvedValue([
      { ...baseRow, id: "a", slug: "a" },
      {
        ...baseRow,
        id: "b",
        slug: "b",
        settings: { _deletedAt: "2026-02-01T00:00:00Z" },
      },
      { ...baseRow, id: "c", slug: "c" },
    ]);

    const result = await service.list({ page: 1, limit: 20 });

    expect(result.total).toBe(2);
    expect(result.institutions.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("applies page/limit windowing over the live rows", async () => {
    prisma.institution.findMany.mockResolvedValue(
      ["a", "b", "c", "d", "e"].map((id) => ({ ...baseRow, id, slug: id })),
    );

    const result = await service.list({ page: 2, limit: 2 });

    expect(result.total).toBe(5);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(2);
    expect(result.institutions.map((i) => i.id)).toEqual(["c", "d"]);
  });

  it("defaults to page 1, limit 20 when omitted", async () => {
    prisma.institution.findMany.mockResolvedValue([baseRow]);

    const result = await service.list({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.institutions).toHaveLength(1);
  });
});

describe("InstitutionService.update", () => {
  it("updates only the provided fields", async () => {
    prisma.institution.findUnique.mockResolvedValue(baseRow);
    prisma.institution.update.mockResolvedValue({
      ...baseRow,
      name: "Renamed",
    });

    await service.update(INSTITUTION_ID, { name: "Renamed" });

    expect(prisma.institution.update).toHaveBeenCalledWith({
      where: { id: INSTITUTION_ID },
      data: { name: "Renamed" },
    });
  });

  it("preserves the soft-delete marker when settings are replaced", async () => {
    // A live row never carries the marker, but guard the invariant regardless:
    // a settings replacement must not resurrect a soft-deleted row. Here the
    // existing row is live, so no marker is carried.
    prisma.institution.findUnique.mockResolvedValue(baseRow);
    prisma.institution.update.mockResolvedValue(baseRow);

    await service.update(INSTITUTION_ID, { settings: { a: 1 } });

    const call = prisma.institution.update.mock.calls[0][0];
    expect(call.data.settings).toEqual({ a: 1 });
    expect(call.data.settings).not.toHaveProperty("_deletedAt");
  });

  it("throws NotFoundError when the institution does not exist", async () => {
    prisma.institution.findUnique.mockResolvedValue(null);

    await expect(
      service.update(INSTITUTION_ID, { name: "X" } as UpdateInstitutionRequest),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps a duplicate-slug P2002 violation to ConflictError", async () => {
    prisma.institution.findUnique.mockResolvedValue(baseRow);
    prisma.institution.update.mockRejectedValue(uniqueViolation());

    await expect(
      service.update(INSTITUTION_ID, { slug: "taken" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("InstitutionService.softDelete", () => {
  it("stamps the delete marker into settings without removing the row", async () => {
    prisma.institution.findUnique.mockResolvedValue({
      ...baseRow,
      settings: { theme: "dark" },
    });
    prisma.institution.update.mockResolvedValue(baseRow);

    await service.softDelete(INSTITUTION_ID);

    const call = prisma.institution.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: INSTITUTION_ID });
    expect(call.data.settings).toHaveProperty("_deletedAt");
    // existing settings are preserved alongside the marker
    expect(call.data.settings.theme).toBe("dark");
  });

  it("throws NotFoundError for an unknown institution", async () => {
    prisma.institution.findUnique.mockResolvedValue(null);

    await expect(service.softDelete(INSTITUTION_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("treats an already soft-deleted institution as not found", async () => {
    prisma.institution.findUnique.mockResolvedValue({
      ...baseRow,
      settings: { _deletedAt: "2026-02-01T00:00:00Z" },
    });

    await expect(service.softDelete(INSTITUTION_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(prisma.institution.update).not.toHaveBeenCalled();
  });
});
