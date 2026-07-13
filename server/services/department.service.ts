import type { PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/http";
import type {
  CreateDepartmentRequest,
  DepartmentDetailResponse,
  DepartmentResponse,
  ListDepartmentsQuery,
  UpdateDepartmentRequest,
} from "../../shared/schemas/department";

/**
 * Department service.
 *
 * Implements the CRUD behaviour behind the API spec's Departments section
 * (GET/POST /departments, GET/PATCH/DELETE /departments/:id). Contains no HTTP
 * concerns — the Prisma client is injected so the service is unit-testable in
 * isolation (mirrors InstitutionService).
 *
 * Tenant isolation: a department belongs to an institution (Department.
 * institutionId, 04-data-model.md). Every operation is scoped to the caller's
 * institutionId — reads never leak departments from another institution, and a
 * lookup for an id outside the caller's institution behaves as absent (404).
 * The institutionId is supplied by the route from the authenticated session,
 * never from the request body.
 *
 * Delete: the spec's DELETE is "if no active projects". Department deletion is a
 * hard delete (unlike the institution soft-delete) — the spec says "Delete
 * department", and the data model gives Department no delete/status column. An
 * "active project" is one that has not been archived (Project.archivedAt IS
 * NULL); a department with any such project cannot be deleted (409 CONFLICT).
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

interface DepartmentRecord {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  createdAt: Date;
}

export interface ListDepartmentsResult {
  departments: DepartmentResponse[];
  page: number;
  limit: number;
  total: number;
}

export class DepartmentService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List the departments of a single institution, newest first, paginated.
   * Scoped to institutionId so one tenant never sees another's departments.
   */
  async list(
    institutionId: string,
    query: ListDepartmentsQuery,
  ): Promise<ListDepartmentsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [rows, total] = await Promise.all([
      this.prisma.department.findMany({
        where: { institutionId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }) as Promise<DepartmentRecord[]>,
      this.prisma.department.count({ where: { institutionId } }),
    ]);

    return {
      departments: rows.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
    };
  }

  /**
   * Create a department within the caller's institution. The code must be
   * unique within that institution (case-insensitively). Uniqueness is enforced
   * by the database's @@unique([institutionId, code]) over a CITEXT `code`; the
   * `assertCodeAvailable` precheck only provides a friendly early error, and the
   * P2002 mapping closes the TOCTOU window where two concurrent creates both
   * pass the precheck.
   */
  async create(
    institutionId: string,
    data: CreateDepartmentRequest,
  ): Promise<DepartmentResponse> {
    await this.assertCodeAvailable(institutionId, data.code);

    try {
      const created = (await this.prisma.department.create({
        data: {
          institutionId,
          name: data.name,
          code: data.code,
        },
      })) as DepartmentRecord;

      return this.toResponse(created);
    } catch (error) {
      throw this.mapCodeConflict(error);
    }
  }

  /**
   * Fetch a single department (scoped to the institution) with its user count
   * and project stats, per the spec's "GET /departments/:id". Throws
   * NotFoundError when the id is unknown or belongs to another institution.
   */
  async getById(
    institutionId: string,
    id: string,
  ): Promise<DepartmentDetailResponse> {
    const row = await this.requireDepartment(institutionId, id);

    const [userCount, totalProjects, activeProjects] = await Promise.all([
      this.prisma.user.count({ where: { departmentId: id } }),
      this.prisma.project.count({ where: { departmentId: id } }),
      this.prisma.project.count({
        where: { departmentId: id, archivedAt: null },
      }),
    ]);

    return {
      ...this.toResponse(row),
      userCount,
      projectStats: { total: totalProjects, active: activeProjects },
    };
  }

  /**
   * Update a department's mutable fields (name, code) within the institution.
   * A code change that collides with another department in the same institution
   * is a ConflictError. Throws NotFoundError when the department is not in the
   * caller's institution.
   */
  async update(
    institutionId: string,
    id: string,
    data: UpdateDepartmentRequest,
  ): Promise<DepartmentResponse> {
    await this.requireDepartment(institutionId, id);

    if (data.code !== undefined) {
      await this.assertCodeAvailable(institutionId, data.code, id);
    }

    const updateData: { name?: string; code?: string } = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.code !== undefined) updateData.code = data.code;

    try {
      const updated = (await this.prisma.department.update({
        where: { id },
        data: updateData,
      })) as DepartmentRecord;

      return this.toResponse(updated);
    } catch (error) {
      throw this.mapCodeConflict(error);
    }
  }

  /**
   * Delete a department, but only when it has no active (non-archived)
   * projects, per the spec. Throws NotFoundError when the department is not in
   * the caller's institution, and ConflictError when active projects remain.
   */
  async delete(institutionId: string, id: string): Promise<void> {
    await this.requireDepartment(institutionId, id);

    const activeProjects = await this.prisma.project.count({
      where: { departmentId: id, archivedAt: null },
    });
    if (activeProjects > 0) {
      throw new ConflictError(
        "Department has active projects and cannot be deleted",
      );
    }

    await this.prisma.department.delete({ where: { id } });
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Fetch a department within the institution, or throw NotFoundError. */
  private async requireDepartment(
    institutionId: string,
    id: string,
  ): Promise<DepartmentRecord> {
    const row = (await this.prisma.department.findUnique({
      where: { id },
    })) as DepartmentRecord | null;
    if (!row || row.institutionId !== institutionId) {
      throw new NotFoundError("Department not found");
    }
    return row;
  }

  /**
   * Best-effort early check that no other department in the institution already
   * uses `code` (case-insensitive). `excludeId` skips the department being
   * updated so a no-op code change on itself is allowed.
   *
   * This is a friendliness optimisation only — it can race under concurrency, so
   * it is NOT the authority for uniqueness. The database's
   * @@unique([institutionId, code]) is; `mapCodeConflict` turns its P2002 into
   * the same ConflictError when two requests slip past this precheck together.
   */
  private async assertCodeAvailable(
    institutionId: string,
    code: string,
    excludeId?: string,
  ): Promise<void> {
    const clash = (await this.prisma.department.findFirst({
      where: {
        institutionId,
        code: { equals: code, mode: "insensitive" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    })) as DepartmentRecord | null;

    if (clash) {
      throw new ConflictError(
        "A department with this code already exists in this institution",
      );
    }
  }

  /**
   * Translate the database's unique-constraint violation (P2002 on
   * institutionId+code) into the same ConflictError the precheck raises. Any
   * other error is rethrown unchanged. This is what actually closes the TOCTOU
   * race between the precheck and the write.
   */
  private mapCodeConflict(error: unknown): unknown {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return new ConflictError(
        "A department with this code already exists in this institution",
      );
    }
    return error;
  }

  private toResponse(row: DepartmentRecord): DepartmentResponse {
    return {
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      code: row.code,
      createdAt: row.createdAt,
    };
  }
}

/**
 * Factory for the department service. Kept as a function so callers (routes,
 * tests) can inject their own Prisma client (mirrors createInstitutionService).
 */
export function createDepartmentService(
  prisma: PrismaClient,
): DepartmentService {
  return new DepartmentService(prisma);
}
