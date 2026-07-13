import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { SupervisorService } from "../../server/services/supervisor.service";
import { NotFoundError, ValidationError } from "../../server/lib/http";

/**
 * Unit tests for SupervisorService (unit 1.5). The Prisma client is fully mocked
 * so the assignment logic is exercised in isolation: tenant scoping, the
 * student/supervisor role checks, the one-primary-supervisor rule (existing
 * primaries are cleared before the new membership is created), reassignment,
 * and the stage transition to Topic Proposal (only when the project is still
 * at/before supervisor assignment).
 */

const INSTITUTION_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_INSTITUTION_ID = "22222222-2222-2222-2222-222222222222";
const STUDENT_ID = "33333333-3333-3333-3333-333333333333";
const SUPERVISOR_ID = "44444444-4444-4444-4444-444444444444";
const PROJECT_ID = "55555555-5555-5555-5555-555555555555";
const MEMBER_ID = "66666666-6666-6666-6666-666666666666";

const assignedAt = new Date("2026-02-01T00:00:00Z");

const student = {
  id: STUDENT_ID,
  firstName: "Sam",
  lastName: "Student",
  email: "sam@nexesis.edu",
  role: "student",
  institutionId: INSTITUTION_ID,
};

const supervisor = {
  id: SUPERVISOR_ID,
  firstName: "Sue",
  lastName: "Super",
  email: "sue@nexesis.edu",
  role: "supervisor",
  institutionId: INSTITUTION_ID,
};

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: PROJECT_ID,
    studentId: STUDENT_ID,
    institutionId: INSTITUTION_ID,
    currentStage: "registration",
    stageStatus: "pending",
    ...overrides,
  };
}

function makePrisma() {
  const tx = {
    projectMember: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi
        .fn()
        .mockResolvedValue({ id: MEMBER_ID, assignedAt }),
    },
    project: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    user: { findUnique: vi.fn() },
    project: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    __tx: tx,
  };
  return prisma as unknown as PrismaClient & {
    user: { findUnique: ReturnType<typeof vi.fn> };
    project: { findFirst: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    __tx: typeof tx;
  };
}

/** Wire user.findUnique to resolve student then supervisor by id. */
function mockUsers(
  prisma: ReturnType<typeof makePrisma>,
  users: Record<string, unknown>,
) {
  prisma.user.findUnique.mockImplementation(
    ({ where }: { where: { id: string } }) =>
      Promise.resolve(users[where.id] ?? null),
  );
}

let prisma: ReturnType<typeof makePrisma>;
let service: SupervisorService;

beforeEach(() => {
  prisma = makePrisma();
  service = new SupervisorService(prisma);
});

describe("SupervisorService.assignToStudent", () => {
  it("assigns a supervisor and advances Registration → Topic Proposal", async () => {
    mockUsers(prisma, {
      [STUDENT_ID]: student,
      [SUPERVISOR_ID]: supervisor,
    });
    prisma.project.findFirst.mockResolvedValue(makeProject());

    const result = await service.assignToStudent(
      INSTITUTION_ID,
      STUDENT_ID,
      SUPERVISOR_ID,
    );

    // One-primary-supervisor rule: existing primaries cleared, single new one.
    expect(prisma.__tx.projectMember.deleteMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, role: "primary_supervisor" },
    });
    expect(prisma.__tx.projectMember.create).toHaveBeenCalledWith({
      data: {
        projectId: PROJECT_ID,
        userId: SUPERVISOR_ID,
        role: "primary_supervisor",
      },
      select: { id: true, assignedAt: true },
    });
    // Stage advanced.
    expect(prisma.__tx.project.update).toHaveBeenCalledWith({
      where: { id: PROJECT_ID },
      data: { currentStage: "topic_proposal", stageStatus: "pending" },
    });
    expect(result.currentStage).toBe("topic_proposal");
    expect(result.stageStatus).toBe("pending");
    expect(result.supervisor.id).toBe(SUPERVISOR_ID);
    expect(result.memberId).toBe(MEMBER_ID);
  });

  it("advances from the supervisor_assignment stage too", async () => {
    mockUsers(prisma, { [STUDENT_ID]: student, [SUPERVISOR_ID]: supervisor });
    prisma.project.findFirst.mockResolvedValue(
      makeProject({ currentStage: "supervisor_assignment" }),
    );

    const result = await service.assignToStudent(
      INSTITUTION_ID,
      STUDENT_ID,
      SUPERVISOR_ID,
    );

    expect(prisma.__tx.project.update).toHaveBeenCalled();
    expect(result.currentStage).toBe("topic_proposal");
  });

  it("reassigns without moving the stage once past supervisor assignment", async () => {
    mockUsers(prisma, { [STUDENT_ID]: student, [SUPERVISOR_ID]: supervisor });
    prisma.project.findFirst.mockResolvedValue(
      makeProject({ currentStage: "chapter_reviews", stageStatus: "in_review" }),
    );

    const result = await service.assignToStudent(
      INSTITUTION_ID,
      STUDENT_ID,
      SUPERVISOR_ID,
    );

    // Membership swapped (rule still enforced) but the stage is untouched.
    expect(prisma.__tx.projectMember.deleteMany).toHaveBeenCalled();
    expect(prisma.__tx.projectMember.create).toHaveBeenCalled();
    expect(prisma.__tx.project.update).not.toHaveBeenCalled();
    expect(result.currentStage).toBe("chapter_reviews");
    expect(result.stageStatus).toBe("in_review");
  });

  it("rejects when the target user is not a student (400)", async () => {
    mockUsers(prisma, {
      [STUDENT_ID]: { ...student, role: "supervisor" },
      [SUPERVISOR_ID]: supervisor,
    });

    await expect(
      service.assignToStudent(INSTITUTION_ID, STUDENT_ID, SUPERVISOR_ID),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it("rejects when the assigned user is not a supervisor (400)", async () => {
    mockUsers(prisma, {
      [STUDENT_ID]: student,
      [SUPERVISOR_ID]: { ...supervisor, role: "student" },
    });

    await expect(
      service.assignToStudent(INSTITUTION_ID, STUDENT_ID, SUPERVISOR_ID),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it("404s for a student in another institution (tenant isolation)", async () => {
    mockUsers(prisma, {
      [STUDENT_ID]: { ...student, institutionId: OTHER_INSTITUTION_ID },
      [SUPERVISOR_ID]: supervisor,
    });

    await expect(
      service.assignToStudent(INSTITUTION_ID, STUDENT_ID, SUPERVISOR_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s for a supervisor in another institution (tenant isolation)", async () => {
    mockUsers(prisma, {
      [STUDENT_ID]: student,
      [SUPERVISOR_ID]: { ...supervisor, institutionId: OTHER_INSTITUTION_ID },
    });

    await expect(
      service.assignToStudent(INSTITUTION_ID, STUDENT_ID, SUPERVISOR_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s when the student has no active project", async () => {
    mockUsers(prisma, { [STUDENT_ID]: student, [SUPERVISOR_ID]: supervisor });
    prisma.project.findFirst.mockResolvedValue(null);

    await expect(
      service.assignToStudent(INSTITUTION_ID, STUDENT_ID, SUPERVISOR_ID),
    ).rejects.toBeInstanceOf(NotFoundError);

    // The active-project query excludes archived projects.
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId: STUDENT_ID, institutionId: INSTITUTION_ID, archivedAt: null },
      }),
    );
  });
});
