import type { Prisma, PrismaClient } from "@prisma/client";
import { ConflictError, NotFoundError } from "../lib/http";
import type {
  CreateSessionRequest,
  ListSessionsQuery,
  SessionDetailResponse,
  SessionResponse,
  SessionSettings,
  SessionStatus,
  UpdateSessionRequest,
} from "../../shared/schemas/session";

/**
 * Academic session service.
 *
 * Implements the behaviour behind the API spec's Academic Sessions section
 * (GET/POST /sessions, GET/PATCH /sessions/:id, POST /sessions/:id/activate,
 * POST /sessions/:id/close). Contains no HTTP concerns — the Prisma client is
 * injected so the service is unit-testable in isolation (mirrors
 * DepartmentService).
 *
 * Tenant isolation: an academic session belongs to an institution
 * (AcademicSession.institutionId, 04-data-model.md). Every operation is scoped
 * to the caller's institutionId — reads never leak another institution's
 * sessions, and a lookup for an id outside the caller's institution behaves as
 * absent (404). The institutionId is supplied by the route from the
 * authenticated session, never from the request body.
 *
 * State transitions (04-data-model.md status enum: planning, active, closed,
 * archived): a session is created in `planning`. `activate` moves it to
 * `active` and, per the spec ("closes previous active session"), closes any
 * other currently-active session in the same institution. `close` moves it to
 * `closed`. Create/update never touch status — it is owned solely by these two
 * transitions.
 */

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// The status a newly created session starts in (first enum value).
const INITIAL_STATUS: SessionStatus = "planning";

// The AcademicSession row as read from Prisma. settings is JSON; narrow here.
interface SessionRecord {
  id: string;
  institutionId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: SessionStatus;
  settings: Prisma.JsonValue;
  createdAt: Date;
}

export interface ListSessionsResult {
  sessions: SessionResponse[];
  page: number;
  limit: number;
  total: number;
}

export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * List the academic sessions of a single institution, newest first,
   * paginated. Scoped to institutionId so one tenant never sees another's
   * sessions.
   */
  async list(
    institutionId: string,
    query: ListSessionsQuery,
  ): Promise<ListSessionsResult> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const [rows, total] = await Promise.all([
      this.prisma.academicSession.findMany({
        where: { institutionId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }) as Promise<SessionRecord[]>,
      this.prisma.academicSession.count({ where: { institutionId } }),
    ]);

    return {
      sessions: rows.map((row) => this.toResponse(row)),
      page,
      limit,
      total,
    };
  }

  /**
   * Create an academic session within the caller's institution. Starts in
   * `planning`; settings defaults to an empty object when omitted. A duplicate
   * name within the institution (the data model's @@unique([institutionId,
   * name])) surfaces as a ConflictError via the DB.
   */
  async create(
    institutionId: string,
    data: CreateSessionRequest,
  ): Promise<SessionResponse> {
    try {
      const created = (await this.prisma.academicSession.create({
        data: {
          institutionId,
          name: data.name,
          startDate: data.startDate,
          endDate: data.endDate,
          status: INITIAL_STATUS,
          settings: (data.settings ?? {}) as Prisma.InputJsonValue,
        },
      })) as SessionRecord;
      return this.toResponse(created);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /**
   * Fetch a single session (scoped to the institution) with its project counts
   * and completion stats, per the spec's "GET /sessions/:id". Throws
   * NotFoundError when the id is unknown or belongs to another institution.
   */
  async getById(
    institutionId: string,
    id: string,
  ): Promise<SessionDetailResponse> {
    const row = await this.requireSession(institutionId, id);

    const [total, active, completed] = await Promise.all([
      this.prisma.project.count({ where: { sessionId: id } }),
      this.prisma.project.count({ where: { sessionId: id, archivedAt: null } }),
      this.prisma.project.count({
        where: { sessionId: id, completedAt: { not: null } },
      }),
    ]);

    const completionRate = total === 0 ? 0 : (completed / total) * 100;

    return {
      ...this.toResponse(row),
      projectCounts: { total, active, completed },
      completionRate,
    };
  }

  /**
   * Update a session's mutable fields (name, startDate, endDate, settings)
   * within the institution. Never changes status. Throws NotFoundError when the
   * session is not in the caller's institution; a name collision maps to
   * ConflictError.
   */
  async update(
    institutionId: string,
    id: string,
    data: UpdateSessionRequest,
  ): Promise<SessionResponse> {
    await this.requireSession(institutionId, id);

    const updateData: Prisma.AcademicSessionUpdateInput = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.startDate !== undefined) updateData.startDate = data.startDate;
    if (data.endDate !== undefined) updateData.endDate = data.endDate;
    if (data.settings !== undefined) {
      updateData.settings = data.settings as Prisma.InputJsonValue;
    }

    try {
      const updated = (await this.prisma.academicSession.update({
        where: { id },
        data: updateData,
      })) as SessionRecord;
      return this.toResponse(updated);
    } catch (error) {
      throw this.mapUniqueViolation(error);
    }
  }

  /**
   * Activate a session: set its status to `active` and, per the spec, close any
   * other currently-active session in the same institution ("closes previous
   * active session"). Done in a transaction so the institution never has two
   * active sessions. Throws NotFoundError when the session is not in the
   * caller's institution.
   */
  async activate(
    institutionId: string,
    id: string,
  ): Promise<SessionResponse> {
    await this.requireSession(institutionId, id);

    const [, activated] = await this.prisma.$transaction([
      // Close every other session in this institution that is currently active.
      this.prisma.academicSession.updateMany({
        where: { institutionId, status: "active", id: { not: id } },
        data: { status: "closed" },
      }),
      this.prisma.academicSession.update({
        where: { id },
        data: { status: "active" },
      }),
    ]);

    return this.toResponse(activated as SessionRecord);
  }

  /**
   * Close a session: set its status to `closed` ("no new projects"). Throws
   * NotFoundError when the session is not in the caller's institution.
   */
  async close(institutionId: string, id: string): Promise<SessionResponse> {
    await this.requireSession(institutionId, id);

    const closed = (await this.prisma.academicSession.update({
      where: { id },
      data: { status: "closed" },
    })) as SessionRecord;

    return this.toResponse(closed);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Fetch a session within the institution, or throw NotFoundError. */
  private async requireSession(
    institutionId: string,
    id: string,
  ): Promise<SessionRecord> {
    const row = (await this.prisma.academicSession.findUnique({
      where: { id },
    })) as SessionRecord | null;
    if (!row || row.institutionId !== institutionId) {
      throw new NotFoundError("Academic session not found");
    }
    return row;
  }

  /** The settings value as a plain object (defensive copy). */
  private settingsObject(settings: Prisma.JsonValue): SessionSettings {
    if (settings && typeof settings === "object" && !Array.isArray(settings)) {
      return { ...(settings as Record<string, unknown>) } as SessionSettings;
    }
    return {};
  }

  private toResponse(row: SessionRecord): SessionResponse {
    return {
      id: row.id,
      institutionId: row.institutionId,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      status: row.status,
      settings: this.settingsObject(row.settings),
      createdAt: row.createdAt,
    };
  }

  /**
   * Translate a Prisma unique-constraint violation (P2002) — the data model's
   * @@unique([institutionId, name]) — into a ConflictError. Any other error is
   * rethrown unchanged.
   */
  private mapUniqueViolation(error: unknown): unknown {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      return new ConflictError(
        "An academic session with this name already exists in this institution",
      );
    }
    return error;
  }
}

/**
 * Factory for the session service. Kept as a function so callers (routes,
 * tests) can inject their own Prisma client (mirrors createDepartmentService).
 */
export function createSessionService(prisma: PrismaClient): SessionService {
  return new SessionService(prisma);
}
