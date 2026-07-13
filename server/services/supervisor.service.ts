import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { NotFoundError, ValidationError } from "../lib/http";

/**
 * Supervisor assignment service (unit 1.5).
 *
 * Implements the behaviour behind the API spec's
 * `POST /users/:id/assign-supervisor` — "Assign supervisor to student
 * (coordinator/admin)" with body `{ supervisorId }`. Contains no HTTP concerns;
 * the Prisma client is injected so the service is unit-testable in isolation
 * (mirrors the other services).
 *
 * The single source of truth for the mechanics is:
 *  - 04-data-model.md → Project / ProjectMember: supervision is modelled as a
 *    ProjectMember row linking a user to a project with a role. The primary
 *    supervisor is the ProjectMember whose role is `primary_supervisor`.
 *  - 03-workflow-spec.md → Supervisor Assignment stage (#2): entry "Student
 *    registered", exit "Supervisor confirmed", approver Coordinator. The next
 *    stage, Topic Proposal (#3), has entry condition "Supervisor assigned".
 *
 * Behaviour derived strictly from those specs (nothing invented):
 *  - One-primary-supervisor rule: a project has exactly one ProjectMember with
 *    role `primary_supervisor`. Assigning replaces any existing one, so the
 *    invariant holds after every call.
 *  - Reassignment: assigning a different supervisor swaps the primary supervisor
 *    (old membership removed, new one created). Assigning the one already in
 *    place is idempotent.
 *  - Stage update: completing supervisor assignment satisfies Topic Proposal's
 *    entry condition ("Supervisor assigned"), so a project still in the
 *    Registration or Supervisor Assignment stage advances to `topic_proposal`
 *    (status reset to `pending`). A project that has already progressed past
 *    supervisor assignment is only re-supervised — its stage is left untouched,
 *    because the workflow permits backward movement solely through explicit
 *    revision requests, which a reassignment is not.
 *
 * Tenant isolation: the student, the supervisor and the project are all scoped
 * to the caller's institutionId (supplied by the route from the authenticated
 * session, never the body). Anything outside the institution reads as absent.
 */

/** Request body for `POST /users/:id/assign-supervisor` (spec: `{ supervisorId }`). */
export const AssignSupervisorRequestSchema = z
  .object({
    supervisorId: z.string().uuid(),
  })
  .strict();

export type AssignSupervisorRequest = z.infer<typeof AssignSupervisorRequestSchema>;

// The stages at/before which a supervisor has not yet been confirmed. Assigning
// a supervisor while the project sits here advances it to Topic Proposal; past
// these, an assignment is a reassignment and does not move the stage.
const PRE_ASSIGNMENT_STAGES = ["registration", "supervisor_assignment"] as const;
const NEXT_STAGE = "topic_proposal";
const NEXT_STAGE_STATUS = "pending";
const PRIMARY_SUPERVISOR = "primary_supervisor";

interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  institutionId: string;
}

interface ProjectRecord {
  id: string;
  studentId: string;
  institutionId: string;
  currentStage: string;
  stageStatus: string;
}

export interface AssignedSupervisor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AssignSupervisorResult {
  projectId: string;
  studentId: string;
  currentStage: string;
  stageStatus: string;
  supervisor: AssignedSupervisor;
  memberId: string;
  assignedAt: Date;
}

export class SupervisorService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Assign (or reassign) the primary supervisor of a student's active project.
   *
   * @param institutionId caller's institution (tenant scope)
   * @param studentId     the `:id` path param — the student to supervise
   * @param supervisorId  the supervisor to assign (request body)
   */
  async assignToStudent(
    institutionId: string,
    studentId: string,
    supervisorId: string,
  ): Promise<AssignSupervisorResult> {
    const student = await this.requireUser(institutionId, studentId);
    if (student.role !== "student") {
      throw new ValidationError("Target user is not a student", [
        { field: "id", message: "User is not a student" },
      ]);
    }

    const supervisor = await this.requireUser(institutionId, supervisorId);
    if (supervisor.role !== "supervisor") {
      throw new ValidationError("Assigned user is not a supervisor", [
        { field: "supervisorId", message: "User is not a supervisor" },
      ]);
    }

    const project = await this.requireActiveProject(institutionId, studentId);

    const advancesStage = PRE_ASSIGNMENT_STAGES.includes(
      project.currentStage as (typeof PRE_ASSIGNMENT_STAGES)[number],
    );

    const member = await this.prisma.$transaction(async (tx) => {
      // Enforce the one-primary-supervisor rule: clear any existing primary
      // supervisor(s), then create the single new membership.
      await tx.projectMember.deleteMany({
        where: { projectId: project.id, role: PRIMARY_SUPERVISOR },
      });

      const created = await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: supervisorId,
          role: PRIMARY_SUPERVISOR,
        },
        select: { id: true, assignedAt: true },
      });

      if (advancesStage) {
        await tx.project.update({
          where: { id: project.id },
          data: { currentStage: NEXT_STAGE, stageStatus: NEXT_STAGE_STATUS },
        });
      }

      return created;
    });

    return {
      projectId: project.id,
      studentId: project.studentId,
      currentStage: advancesStage ? NEXT_STAGE : project.currentStage,
      stageStatus: advancesStage ? NEXT_STAGE_STATUS : project.stageStatus,
      supervisor: {
        id: supervisor.id,
        firstName: supervisor.firstName,
        lastName: supervisor.lastName,
        email: supervisor.email,
      },
      memberId: member.id,
      assignedAt: member.assignedAt,
    };
  }

  // ── internals ──────────────────────────────────────────────────────────────

  /** Fetch a user within the institution, or throw NotFoundError. */
  private async requireUser(
    institutionId: string,
    id: string,
  ): Promise<UserRecord> {
    const row = (await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        institutionId: true,
      },
    })) as UserRecord | null;
    if (!row || row.institutionId !== institutionId) {
      throw new NotFoundError("User not found");
    }
    return row;
  }

  /**
   * Fetch the student's active (non-archived) project within the institution.
   * Assignment operates on the current project; a student with no active project
   * cannot be supervised (404). Ordered newest-first so the current project is
   * chosen when more than one active project exists across sessions.
   */
  private async requireActiveProject(
    institutionId: string,
    studentId: string,
  ): Promise<ProjectRecord> {
    const project = (await this.prisma.project.findFirst({
      where: { studentId, institutionId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        studentId: true,
        institutionId: true,
        currentStage: true,
        stageStatus: true,
      },
    })) as ProjectRecord | null;
    if (!project) {
      throw new NotFoundError("Student has no active project");
    }
    return project;
  }
}

/**
 * Factory for the supervisor service. Kept as a function so callers (routes,
 * tests) can inject their own Prisma client (mirrors the other service
 * factories).
 */
export function createSupervisorService(prisma: PrismaClient): SupervisorService {
  return new SupervisorService(prisma);
}
