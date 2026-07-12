import { describe, it, expect, vi, beforeEach } from "vitest";
import { canAccessProject } from "../../server/websocket/events/index";
import type { ProjectAccessDb } from "../../server/websocket/events/index";
import type { SessionUser } from "../../shared/schemas/auth";

/**
 * Unit tests for the project-room access predicate that gates `user:typing`
 * joins. Proves a client cannot subscribe to an arbitrary project room:
 * tenant isolation is enforced first, then the spec's per-role visibility
 * (student → own project, supervisor/examiner → assigned, coordinator/admin →
 * any project in their institution). The Prisma surface is mocked.
 */

const INSTITUTION_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INSTITUTION_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const STUDENT_ID = "22222222-2222-2222-2222-222222222222";
const OTHER_USER_ID = "33333333-3333-3333-3333-333333333333";

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: OTHER_USER_ID,
    email: "user@nexesis.edu",
    role: "supervisor",
    institutionId: INSTITUTION_A,
    departmentId: null,
    ...overrides,
  };
}

function makeDb(
  project: { institutionId: string; studentId: string } | null,
  member: { id: string } | null = null,
) {
  const findUnique = vi.fn().mockResolvedValue(project);
  const findFirst = vi.fn().mockResolvedValue(member);
  const db: ProjectAccessDb = {
    project: { findUnique },
    projectMember: { findFirst },
  };
  return { db, findUnique, findFirst };
}

let projectInA: { institutionId: string; studentId: string };

beforeEach(() => {
  projectInA = { institutionId: INSTITUTION_A, studentId: STUDENT_ID };
});

describe("canAccessProject — existence & tenant isolation", () => {
  it("denies a project that does not exist", async () => {
    const { db, findFirst } = makeDb(null);
    const ok = await canAccessProject(makeUser({ role: "admin" }), PROJECT_ID, db);
    expect(ok).toBe(false);
    // never falls through to a membership lookup
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("denies a project in another institution regardless of role", async () => {
    const { db } = makeDb({ institutionId: INSTITUTION_B, studentId: STUDENT_ID });
    for (const role of [
      "admin",
      "coordinator",
      "supervisor",
      "student",
    ] as const) {
      const ok = await canAccessProject(
        makeUser({ role, id: STUDENT_ID }),
        PROJECT_ID,
        db,
      );
      expect(ok, `role=${role}`).toBe(false);
    }
  });
});

describe("canAccessProject — role-based access within the institution", () => {
  it("allows admin and coordinator for any project in their institution", async () => {
    for (const role of ["admin", "coordinator"] as const) {
      const { db, findFirst } = makeDb(projectInA);
      const ok = await canAccessProject(makeUser({ role }), PROJECT_ID, db);
      expect(ok, `role=${role}`).toBe(true);
      expect(findFirst).not.toHaveBeenCalled(); // no membership needed
    }
  });

  it("allows a student only for their own project", async () => {
    const { db } = makeDb(projectInA);
    const own = await canAccessProject(
      makeUser({ role: "student", id: STUDENT_ID }),
      PROJECT_ID,
      db,
    );
    expect(own).toBe(true);
  });

  it("denies a student another student's project", async () => {
    const { db, findFirst } = makeDb(projectInA);
    const ok = await canAccessProject(
      makeUser({ role: "student", id: OTHER_USER_ID }),
      PROJECT_ID,
      db,
    );
    expect(ok).toBe(false);
    expect(findFirst).not.toHaveBeenCalled(); // students never use membership
  });

  it("allows a supervisor assigned to the project (membership present)", async () => {
    const { db, findFirst } = makeDb(projectInA, { id: "member-1" });
    const ok = await canAccessProject(
      makeUser({ role: "supervisor" }),
      PROJECT_ID,
      db,
    );
    expect(ok).toBe(true);
    expect(findFirst).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID, userId: OTHER_USER_ID },
      select: { id: true },
    });
  });

  it("denies a supervisor not assigned to the project (no membership)", async () => {
    const { db } = makeDb(projectInA, null);
    const ok = await canAccessProject(
      makeUser({ role: "supervisor" }),
      PROJECT_ID,
      db,
    );
    expect(ok).toBe(false);
  });

  it("allows an examiner assigned as a project member", async () => {
    const { db } = makeDb(projectInA, { id: "member-2" });
    const ok = await canAccessProject(
      makeUser({ role: "examiner" }),
      PROJECT_ID,
      db,
    );
    expect(ok).toBe(true);
  });

  it("denies an hod with no membership (no institution-wide grant)", async () => {
    const { db } = makeDb(projectInA, null);
    const ok = await canAccessProject(makeUser({ role: "hod" }), PROJECT_ID, db);
    expect(ok).toBe(false);
  });
});
