import type { Prisma, PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/http";
import type {
  CreateInstitutionRequest,
  InstitutionResponse,
  ListInstitutionsQuery,
  UpdateInstitutionRequest,
} from "../../shared/schemas/institution";
import {
  RESERVED_SETTINGS_KEYS,
  SUBSCRIPTION_TIERS,
} from "../../shared/schemas/institution";

/**
 * Institution service.
 *
 * Implements the CRUD behaviour behind the API spec's Institutions section
 * (GET/POST /institutions, GET/PATCH/DELETE /institutions/:id). Contains no HTTP
 * concerns — the Prisma client is injected so the service is unit-testable in
 * isolation (mirrors AuthService).
 *
 * Soft-delete: the DELETE endpoint is a soft-delete recorded in the dedicated
 * `Institution.deletedAt` column (null = live). Using a column rather than a
 * settings-JSONB marker means (a) a PATCH that replaces `settings` can never
 * resurrect or clobber the deletion, and (b) the delete is an atomic
 * conditional write (`updateMany where deletedAt is null`) rather than a racy
 * read-modify-write. Reads exclude deleted rows, so a soft-deleted institution
 * behaves as absent (404) while its row is preserved.
 */

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
  deletedAt: Date | null;
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
   * live filter and windowing run in the database now that soft-delete is a
   * first-class column.
   */
  async list(query: ListInstitutionsQuery): Promise<ListInstitutionsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [rows, total] = await Promise.all([
      this.prisma.institution.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }) as Promise<InstitutionRecord[]>,
      this.prisma.institution.count({ where: { deletedAt: null } }),
    ]);

    return {
      institutions: rows.map((row) => this.toResponse(row)),
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
  async create(data: CreateInstitutionRequest): Promise<InstitutionResponse> {
    try {
      const created = (await this.prisma.institution.create({
        data: {
          name: data.name,
          slug: data.slug,
          settings: this.sanitizeSettings(data.settings ?? {}),
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
    const row = (await this.prisma.institution.findFirst({
      where: { id, deletedAt: null },
    })) as InstitutionRecord | null;
    if (!row) throw new NotFoundError("Institution not found");
    return this.toResponse(row);
  }

  /**
   * Update an institution's mutable fields. The write is conditional on the row
   * still being live (`deletedAt is null`); if a concurrent softDelete() has
   * marked it, the update matches no row and surfaces as NotFound — so an update
   * can never race with (and silently undo) a deletion.
   */
  async update(
    id: string,
    data: UpdateInstitutionRequest,
  ): Promise<InstitutionResponse> {
    const updateData: Prisma.InstitutionUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.slug !== undefined) updateData.slug = data.slug;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.subscriptionTier !== undefined) {
      updateData.subscriptionTier = data.subscriptionTier;
    }
    if (data.settings !== undefined) {
      updateData.settings = this.sanitizeSettings(data.settings);
    }

    try {
      const updated = (await this.prisma.institution.update({
        where: { id, deletedAt: null },
        data: updateData,
      })) as InstitutionRecord;
      return this.toResponse(updated);
    } catch (error) {
      // A row that is missing or already soft-deleted no longer matches the
      // `deletedAt is null` filter → P2025 (record not found) → 404.
      if (this.isRecordNotFound(error)) {
        throw new NotFoundError("Institution not found");
      }
      throw this.mapUniqueViolation(error, "slug");
    }
  }

  /**
   * Soft-delete an institution by stamping `deletedAt`. Atomic and idempotent:
   * the conditional `updateMany` marks the row only while it is still live, so
   * two concurrent deletes cannot both "succeed" — the loser matches zero rows
   * and is treated as not found (the row already reads as absent).
   */
  async softDelete(id: string): Promise<void> {
    const { count } = await this.prisma.institution.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) throw new NotFoundError("Institution not found");
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Strip reserved internal keys from a client-supplied settings object before
   * it is persisted. The schema already rejects them at the HTTP boundary; this
   * is the defence-in-depth "again before persisting" strip for any caller that
   * bypasses the route validation.
   */
  private sanitizeSettings(
    settings: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const clean: Record<string, unknown> = { ...settings };
    for (const key of RESERVED_SETTINGS_KEYS) delete clean[key];
    return clean as Prisma.InputJsonValue;
  }

  /** The settings value as a plain object (defensive copy). */
  private settingsObject(settings: Prisma.JsonValue): Record<string, unknown> {
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      return { ...(settings as Record<string, unknown>) };
    }
    return {};
  }

  /** Map a row to its public response, stripping any reserved internal keys. */
  private toResponse(row: InstitutionRecord): InstitutionResponse {
    const settings = this.settingsObject(row.settings);
    for (const key of RESERVED_SETTINGS_KEYS) delete settings[key];

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

  /** True for Prisma's "record to update not found" error (P2025). */
  private isRecordNotFound(error: unknown): boolean {
    return (
      !!error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2025"
    );
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
