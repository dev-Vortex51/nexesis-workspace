import { APIError } from "better-auth/api";
import type { PrismaClient } from "@prisma/client";
import type { Auth } from "../auth";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../lib/http";
import type { UserResponse } from "../../shared/schemas/auth";
import type {
  CreateUserRequest,
  ListUsersQuery,
  UpdateUserRequest,
  UserDetailResponse,
  UserProjectSummary,
} from "../../shared/schemas/user";

/**
 * User management service.
 *
 * Implements the behaviour behind the API spec's Users section (GET/POST
 * /users, GET/PATCH/DELETE /users/:id). Contains no HTTP concerns — the Better
 * Auth instance and Prisma client are injected so the service is unit-testable
 * in isolation (mirrors AuthService/DepartmentService).
 *
 * Tenant isolation: a user belongs to an institution (User.institutionId,
 * 04-data-model.md). Every operation is scoped to the caller's institutionId —
 * reads never leak another institution's users, and a lookup for an id outside
 * the caller's institution behaves as absent (404). The institutionId is
 * supplied by the route from the authenticated session, never from the body.
 *
 * Credentials: user creation goes through Better Auth (`signUpEmail`), which
 * writes the hashed password to the Account table — never to User (consistent
 * with the auth foundation). No user payload ever exposes a credential or the
 * MFA secret.
 *
 * Privileged fields: `role` and `status` may only be changed by an admin. The
 * route passes an `isAdmin` flag; a non-admin (self) update that carries either
 * field is rejected (403) so a user cannot escalate their own role or lift a
 * suspension on themselves.
 *
 * Delete: the spec's DELETE is "Suspend user" — a soft state change
 * (status → suspended), not a row deletion (the data model gives User a
 * `status` enum with a `suspended` value for exactly this).
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// The subset of User columns the service reads. Mirrors AuthService.UserRecord;
// credentials and mfaSecret are deliberately absent.
interface UserRecord {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  institutionId: string;
  departmentId: string | null;
  status: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// The Project columns surfaced in a user's role-specific data.
interface ProjectSummaryRecord {
  id: string;
  title: string | null;
  currentStage: string;
  stageStatus: string;
  progress: number;
}

export interface ListUsersResult {
  users: UserResponse[];
  page: number;
  limit: number;
  total: number;
}

export class UserService {
  constructor(
    private readonly auth: Auth,
    private readonly prisma: PrismaClient,
  ) {}

  /**
   * List the users of a single institution with the spec's filters (role,
   * departmentId, status, search by name or email), newest first, paginated.
   * Scoped to institutionId so one tenant never sees another's users.
   */
  async list(
    institutionId: string,
    query: ListUsersQuery,
  ): Promise<ListUsersResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where = this.buildListWhere(institutionId, query);

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }) as Promise<UserRecord[]>,
      this.prisma.user.count({ where }),
    ]);

    return {
      users: rows.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
    };
  }

  /**
   * Create a user within the caller's institution (admin only — enforced at the
   * route). Unlike public registration, the admin assigns the role and optional
   * department here. The credential is created by Better Auth; a duplicate email
   * surfaces as a ConflictError. A departmentId, when given, must belong to the
   * caller's institution (tenant isolation).
   */
  async create(
    institutionId: string,
    data: CreateUserRequest,
  ): Promise<UserResponse> {
    await this.assertEmailAvailable(data.email);

    if (data.departmentId != null) {
      await this.assertDepartmentInInstitution(institutionId, data.departmentId);
    }

    try {
      await this.auth.api.signUpEmail({
        body: {
          email: data.email,
          password: data.password,
          name: `${data.firstName} ${data.lastName}`,
          firstName: data.firstName,
          lastName: data.lastName,
          role: data.role,
          institutionId,
          departmentId: data.departmentId ?? null,
        } as never,
      });
    } catch (error) {
      throw this.mapAuthError(error);
    }

    const created = await this.requireUserByEmail(data.email);
    return this.toResponse(created);
  }

  /**
   * Fetch a single user (scoped to the institution) with role-specific data,
   * per the spec's "GET /users/:id". Throws NotFoundError when the id is unknown
   * or belongs to another institution.
   */
  async getById(
    institutionId: string,
    id: string,
  ): Promise<UserDetailResponse> {
    const row = await this.requireUser(institutionId, id);

    const roleData = await this.loadRoleData(row);

    return {
      ...this.toResponse(row),
      roleData,
    };
  }

  /**
   * Update a user within the institution. Base fields (firstName, lastName,
   * departmentId) are updatable by admin or the user themselves; `role` and
   * `status` are admin-only — a non-admin update carrying either is rejected
   * (403). `name` is kept in sync when either name part changes (mirrors
   * AuthService.updateProfile). Throws NotFoundError when the user is not in the
   * caller's institution.
   */
  async update(
    institutionId: string,
    id: string,
    data: UpdateUserRequest,
    isAdmin: boolean,
  ): Promise<UserResponse> {
    const existing = await this.requireUser(institutionId, id);

    if (!isAdmin && (data.role !== undefined || data.status !== undefined)) {
      throw new AuthorizationError(
        "Only an admin may change a user's role or status",
      );
    }

    if (data.departmentId != null) {
      await this.assertDepartmentInInstitution(institutionId, data.departmentId);
    }

    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.firstName !== undefined || data.lastName !== undefined) {
      const firstName = data.firstName ?? existing.firstName;
      const lastName = data.lastName ?? existing.lastName;
      updateData.name = `${firstName} ${lastName}`;
    }
    if (data.departmentId !== undefined) {
      updateData.departmentId = data.departmentId;
    }
    if (data.role !== undefined) updateData.role = data.role;
    if (data.status !== undefined) updateData.status = data.status;

    const updated = (await this.prisma.user.update({
      where: { id },
      data: updateData,
    })) as unknown as UserRecord;

    return this.toResponse(updated);
  }

  /**
   * Suspend a user (status → suspended), per the spec's "DELETE /users/:id —
   * Suspend user (admin only)". A soft state change, not a row deletion. Throws
   * NotFoundError when the user is not in the caller's institution.
   */
  async suspend(institutionId: string, id: string): Promise<UserResponse> {
    await this.requireUser(institutionId, id);

    const updated = (await this.prisma.user.update({
      where: { id },
      data: { status: "suspended" },
    })) as unknown as UserRecord;

    return this.toResponse(updated);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /**
   * Build the Prisma `where` for the list query from the spec's filters. Always
   * scoped to the institution. `search` matches name or email case-insensitively
   * (the User entity has firstName/lastName/email; `name` holds the composed
   * full name kept in sync on write).
   */
  private buildListWhere(
    institutionId: string,
    query: ListUsersQuery,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { institutionId };
    if (query.role) where.role = query.role;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;
    if (query.search) {
      const contains = { contains: query.search, mode: "insensitive" as const };
      where.OR = [
        { firstName: contains },
        { lastName: contains },
        { name: contains },
        { email: contains },
      ];
    }
    return where;
  }

  /**
   * Load the role-specific project associations for a user (GET /users/:id).
   * Both branches read plain relational data from the model:
   *  - `projects`: the user's own projects (Project.studentId) — relevant to a
   *    student.
   *  - `supervisedProjects`: projects the user is a member of (ProjectMember.
   *    userId) — relevant to a supervisor/examiner/co-supervisor.
   * The empty branch stays an empty array so the response shape is stable.
   */
  private async loadRoleData(user: UserRecord): Promise<{
    projects: UserProjectSummary[];
    supervisedProjects: UserProjectSummary[];
  }> {
    const [ownProjects, memberships] = await Promise.all([
      this.prisma.project.findMany({
        where: { studentId: user.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          currentStage: true,
          stageStatus: true,
          progress: true,
        },
      }) as Promise<ProjectSummaryRecord[]>,
      this.prisma.projectMember.findMany({
        where: { userId: user.id },
        orderBy: { assignedAt: "desc" },
        select: {
          project: {
            select: {
              id: true,
              title: true,
              currentStage: true,
              stageStatus: true,
              progress: true,
            },
          },
        },
      }) as Promise<{ project: ProjectSummaryRecord }[]>,
    ]);

    return {
      projects: ownProjects.map((p) => this.toProjectSummary(p)),
      supervisedProjects: memberships.map((m) =>
        this.toProjectSummary(m.project),
      ),
    };
  }

  /** Fetch a user within the institution, or throw NotFoundError. */
  private async requireUser(
    institutionId: string,
    id: string,
  ): Promise<UserRecord> {
    const row = (await this.prisma.user.findUnique({
      where: { id },
    })) as unknown as UserRecord | null;
    if (!row || row.institutionId !== institutionId) {
      throw new NotFoundError("User not found");
    }
    return row;
  }

  private async requireUserByEmail(email: string): Promise<UserRecord> {
    const row = (await this.prisma.user.findUnique({
      where: { email },
    })) as unknown as UserRecord | null;
    if (!row) throw new NotFoundError("User not found");
    return row;
  }

  /**
   * Ensure no user already exists with this email (User.email is globally
   * unique in the data model). Better Auth also guards this, but an explicit
   * pre-check makes the duplicate a deterministic ConflictError rather than
   * relying on the adapter's error surface. Compared case-insensitively.
   */
  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = (await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    })) as { id: string } | null;
    if (existing) {
      throw new ConflictError("A user with this email already exists");
    }
  }

  /**
   * Ensure a department exists and belongs to the caller's institution before
   * it is assigned to a user. A department outside the institution (or absent)
   * would break tenant isolation, so it is rejected as a validation error.
   */
  private async assertDepartmentInInstitution(
    institutionId: string,
    departmentId: string,
  ): Promise<void> {
    const department = (await this.prisma.department.findUnique({
      where: { id: departmentId },
    })) as { institutionId: string } | null;
    if (!department || department.institutionId !== institutionId) {
      throw new ValidationError("Department not found in this institution", [
        { field: "departmentId", message: "Unknown department" },
      ]);
    }
  }

  private toProjectSummary(row: ProjectSummaryRecord): UserProjectSummary {
    return {
      id: row.id,
      title: row.title,
      currentStage: row.currentStage,
      stageStatus: row.stageStatus,
      progress: row.progress,
    };
  }

  private toResponse(user: UserRecord): UserResponse {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role as UserResponse["role"],
      institutionId: user.institutionId,
      departmentId: user.departmentId,
      status: user.status as UserResponse["status"],
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Translate a Better Auth APIError raised during user creation into a typed
   * application error (mirrors AuthService.mapAuthError). A duplicate email is a
   * CONFLICT; a rejected payload is a VALIDATION_ERROR.
   */
  private mapAuthError(error: unknown): Error {
    if (error instanceof APIError) {
      const message =
        typeof error.body?.message === "string"
          ? error.body.message
          : "Could not create user";
      switch (error.status) {
        case "UNPROCESSABLE_ENTITY":
        case "CONFLICT":
          return new ConflictError(message);
        case "BAD_REQUEST":
          return new ValidationError(message);
        default:
          return new ValidationError(message);
      }
    }
    return error instanceof Error ? error : new Error("Could not create user");
  }
}

/**
 * Factory for the user service. Kept as a function so callers (routes, tests)
 * can inject their own auth instance and Prisma client (mirrors
 * createAuthService).
 */
export function createUserService(
  auth: Auth,
  prisma: PrismaClient,
): UserService {
  return new UserService(auth, prisma);
}
