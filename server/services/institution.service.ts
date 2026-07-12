import type { Prisma, PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/http";
import type {
  CreateInstitutionRequest,
  InstitutionResponse,
  ListInstitutionsQuery,
  UpdateInstitutionRequest,
} from "../../shared/schemas/institution";
import { SUBSCRIPTION_TIERS } from "../../shared/schemas/institution";

/**
 * Institution service.
 *
 * Implements the CRUD behaviour behind the API spec's Institutions section
 * (GET/POST /institutions, GET/PATCH/DELETE /institutions/:id). Contains no HTTP
 * concerns — the Prisma client is injected so the service is unit-testable in
 * isolation (mirrors AuthService).
 *
 * Soft-delete: the data model's Institution entity defines no delete column,
 * but the spec's DELETE endpoint is a soft-delete. Rather than invent a schema
 * column, the deletion marker is written into the existing `settings` JSONB
 * field under the reserved `_deletedAt` key. Reads exclude marked rows, so a
 * soft-deleted institution behaves as absent (404) while its row is preserved.
 */

// Reserved key inside the settings JSONB that marks a soft-deleted row. Stripped
// from every response so it never leaks into the public settings object.
const DELETED_AT_KEY = "_deletedAt";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// The Institution row as read from Prisma. settings is JSON; narrow it here.
interface InstitutionRecord {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  settings: Prisma.JsonValue;
  subscriptionTier: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListInstitutionsResult {
  institutions: InstitutionResponse[];
  page: number;
  limit: number;
  total: number;
}

export class InstitutionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List institutions that are not soft-deleted, newest first, paginated. The
   * soft-delete filter is applied in memory because the marker lives inside the
   * JSONB settings field (see file header) — the row counts here are small
   * (institutions, not per-tenant data), so this is acceptable.
   */
  async list(query: ListInstitutionsQuery): Promise<ListInstitutionsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const rows = (await this.prisma.institution.findMany({
      orderBy: { createdAt: "desc" },
    })) as InstitutionRecord[];

    const live = rows.filter((row) => !this.isDeleted(row));
    const total = live.length;
    const start = (page - 1) * limit;
    const paged = live.slice(start, start + limit);

    return {
      institutions: paged.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
    };
  }

  /**
   * Create an institution. subscriptionTier is not part of the spec's create
   * body, so it defaults to the first tier ("free"). A duplicate slug (the data
   * model requires slugs to be unique) surfaces as a ConflictError.
   */
  async create(
    data: CreateInstitutionRequest,
  ): Promise<InstitutionResponse> {
    try {
      const created = (await this.prisma.institution.create({
        data: {
          name: data.name,
          slug: data.slug,
          settings: (data.settings ?? {}) as Prisma.InputJsonValue,
          subscriptionTier: SUBSCRIPTION_TIERS[0],
        },
      })) as InstitutionRecord;
      return this.toResponse(created);
    } catch (error) {
      throw this.mapUniqueViolation(error, "slug");
    }
  }

  /** Fetch a single non-deleted institution by id, or throw NotFoundError. */
  async getById(id: string): Promise<InstitutionResponse> {
    const row = await this.requireLiveInstitution(id);
    return this.toResponse(row);
  }

  /**
   * Update an institution's mutable fields. Preserves the internal soft-delete
   * marker when `settings` is replaced, so an update never resurrects the row.
   */
  async update(
    id: string,
    data: UpdateInstitutionRequest,
  ): Promise<InstitutionResponse> {
    const existing = await this.requireLiveInstitution(id);

    const updateData: Prisma.InstitutionUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.subscriptionTier !== undefined) {
      updateData.subscriptionTier = data.subscriptionTier;
    }
    if (data.settings !== undefined) {
      // Carry over the reserved deletion marker (absent on a live row) so a
      // settings replacement can never clear soft-delete state as a side effect.
      const marker = this.readMarker(existing.settings);
      updateData.settings = {
        ...data.settings,
        ...(marker !== undefined ? { [DELETED_AT_KEY]: marker } : {}),
      } as Prisma.InputJsonValue;
    }

    try {
      const updated = (await this.prisma.institution.update({
        where: { id },
        data: updateData,
      })) as InstitutionRecord;
      return this.toResponse(updated);
    } catch (error) {
      throw this.mapUniqueViolation(error, "slug");
    }
  }

  /**
   * Soft-delete an institution by stamping the reserved marker into its
   * settings JSONB. Idempotent for the caller's purposes: a second delete of an
   * already-deleted institution is treated as not found (the row reads as
   * absent). Returns nothing — the route replies 200 with an empty envelope.
   */
  async softDelete(id: string): Promise<void> {
    const existing = await this.requireLiveInstitution(id);

    const settings = this.settingsObject(existing.settings);
    settings[DELETED_AT_KEY] = new Date().toISOString();

    await this.prisma.institution.update({
      where: { id },
      data: { settings: settings as Prisma.InputJsonValue },
    });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private async requireLiveInstitution(
    id: string,
  ): Promise<InstitutionRecord> {
    const row = (await this.prisma.institution.findUnique({
      where: { id },
    })) as InstitutionRecord | null;
    if (!row || this.isDeleted(row)) {
      throw new NotFoundError("Institution not found");
    }
    return row;
  }

  /** The settings value as a mutable plain object (defensive copy). */
  private settingsObject(
    settings: Prisma.JsonValue,
  ): Record<string, unknown> {
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      return { ...(settings as Record<string, unknown>) };
    }
    return {};
  }

  /** Read the raw soft-delete marker, or undefined when the row is live. */
  private readMarker(settings: Prisma.JsonValue): unknown {
    return this.settingsObject(settings)[DELETED_AT_KEY];
  }

  private isDeleted(row: InstitutionRecord): boolean {
    return this.readMarker(row.settings) !== undefined;
  }

  /** Map a row to its public response, stripping the internal delete marker. */
  private toResponse(row: InstitutionRecord): InstitutionResponse {
    const settings = this.settingsObject(row.settings);
    delete settings[DELETED_AT_KEY];

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl,
      settings,
      subscriptionTier:
        row.subscriptionTier as InstitutionResponse["subscriptionTier"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Translate a Prisma unique-constraint violation (P2002) into a ConflictError
   * for the offending field. Any other error is rethrown unchanged.
   */
  private mapUniqueViolation(error: unknown, field: string): unknown {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return new ConflictError(`An institution with this ${field} already exists`);
    }
    return error;
  }
}

/**
 * Factory for the institution service. Kept as a function so callers (routes,
 * tests) can inject their own Prisma client (mirrors createAuthService).
 */
export function createInstitutionService(
  prisma: PrismaClient,
): InstitutionService {
  return new InstitutionService(prisma);
}
