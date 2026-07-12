import { USER_ROLES } from "../schemas/auth";

/**
 * RBAC permission matrix.
 *
 * The single source of truth for role-based authorization. Every permission
 * here is derived directly from an EXPLICIT role annotation in the API
 * specification (05-api-spec.md) — nothing is invented. Routes that the spec
 * does not gate by role (e.g. reads scoped by institution, or actions guarded
 * only by resource ownership) are intentionally absent: they are enforced by
 * `requireAuth` + ownership checks, not by this static matrix.
 *
 * The matrix is keyed by the six roles defined in the data model
 * (04-data-model.md → User.role): student, supervisor, coordinator, hod,
 * admin, examiner. Roles with no elevated grants (hod, examiner) still key the
 * matrix with an empty set — they reach non-role-gated routes normally.
 *
 * Note on "super-admin": the API spec labels the institution-management
 * endpoints "super-admin only", but no super-admin value exists in the
 * User.role enum. Those permissions are therefore granted to `admin`, the
 * highest role the data model defines; no new role is introduced.
 */

export type UserRole = (typeof USER_ROLES)[number];

/**
 * The discrete permissions enforced by the matrix. Each corresponds to a
 * route the API spec explicitly restricts to one or more roles. The `*-any`
 * suffix marks an administrative override of an otherwise ownership-scoped
 * action (e.g. deleting another user's feedback).
 */
export const PERMISSIONS = {
  // Auth / user provisioning
  USER_REGISTER: "user:register", // POST /auth/register — admin only
  USER_CREATE: "user:create", // POST /users — admin only
  USER_UPDATE_ANY: "user:update-any", // PATCH /users/:id — admin (or self via ownership)
  USER_SUSPEND: "user:suspend", // DELETE /users/:id — admin only
  USER_ASSIGN_SUPERVISOR: "user:assign-supervisor", // POST /users/:id/assign-supervisor — coordinator/admin

  // Institutions (spec: "super-admin only" → admin)
  INSTITUTION_LIST: "institution:list", // GET /institutions
  INSTITUTION_CREATE: "institution:create", // POST /institutions

  // Departments
  DEPARTMENT_CREATE: "department:create", // POST /departments — admin only

  // Academic sessions
  SESSION_CREATE: "session:create", // POST /sessions — coordinator/admin

  // Projects
  PROJECT_CREATE: "project:create", // POST /projects — coordinator (student self-register is conditional)
  PROJECT_SUBMIT_TOPICS: "project:submit-topics", // POST /projects/:id/submit-topics — student
  PROJECT_APPROVE_TOPIC: "project:approve-topic", // POST /projects/:id/approve-topic — supervisor
  PROJECT_RECOMMEND_DEFENSE: "project:recommend-defense", // POST /projects/:id/recommend-defense — supervisor
  PROJECT_SCHEDULE_DEFENSE: "project:schedule-defense", // POST /projects/:id/schedule-defense — coordinator
  PROJECT_COMPLETE: "project:complete", // POST /projects/:id/complete — coordinator

  // Documents
  DOCUMENT_VIEW_DELETED: "document:view-deleted", // GET ...?includeDeleted — admin only
  DOCUMENT_RESTORE: "document:restore", // POST /documents/:id/restore — admin only

  // Feedback
  FEEDBACK_DELETE_ANY: "feedback:delete-any", // DELETE /feedback/:id — admin (or author via ownership)

  // Grades
  GRADE_APPROVE: "grade:approve", // POST /grades/:id/approve — coordinator/admin

  // Rubrics
  RUBRIC_CREATE: "rubric:create", // POST /rubrics — coordinator/admin

  // Announcements
  ANNOUNCEMENT_CREATE: "announcement:create", // POST /announcements — coordinator/admin
  ANNOUNCEMENT_DELETE_ANY: "announcement:delete-any", // DELETE /announcements/:id — admin (or author via ownership)

  // Audit logs
  AUDIT_READ: "audit:read", // GET /audit-logs — admin only
  AUDIT_EXPORT: "audit:export", // GET /audit-logs/export — admin only
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const P = PERMISSIONS;

/**
 * Role → permissions granted. Every entry traces to an explicit spec
 * annotation; see the inline comments on each PERMISSIONS member for the
 * source route. Absence of a permission means the role must rely on
 * ownership/scoping (enforced elsewhere) or has no access.
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  student: [
    // "Student submits proposed research topics."
    P.PROJECT_SUBMIT_TOPICS,
  ],
  supervisor: [
    // "Supervisor approves a topic." / "Supervisor recommends project for defense."
    P.PROJECT_APPROVE_TOPIC,
    P.PROJECT_RECOMMEND_DEFENSE,
  ],
  coordinator: [
    // "coordinator/admin" and coordinator-only workflow actions.
    P.USER_ASSIGN_SUPERVISOR,
    P.SESSION_CREATE,
    P.PROJECT_CREATE,
    P.PROJECT_SCHEDULE_DEFENSE,
    P.PROJECT_COMPLETE,
    P.GRADE_APPROVE,
    P.RUBRIC_CREATE,
    P.ANNOUNCEMENT_CREATE,
  ],
  // The data model defines `hod` and `examiner` but the API spec grants them
  // no role-gated permissions; they operate via ownership/scoped access only.
  hod: [],
  examiner: [],
  admin: [
    P.USER_REGISTER,
    P.USER_CREATE,
    P.USER_UPDATE_ANY,
    P.USER_SUSPEND,
    P.USER_ASSIGN_SUPERVISOR,
    P.INSTITUTION_LIST,
    P.INSTITUTION_CREATE,
    P.DEPARTMENT_CREATE,
    P.SESSION_CREATE,
    P.PROJECT_CREATE,
    P.DOCUMENT_VIEW_DELETED,
    P.DOCUMENT_RESTORE,
    P.FEEDBACK_DELETE_ANY,
    P.GRADE_APPROVE,
    P.RUBRIC_CREATE,
    P.ANNOUNCEMENT_CREATE,
    P.ANNOUNCEMENT_DELETE_ANY,
    P.AUDIT_READ,
    P.AUDIT_EXPORT,
  ],
};

/** True when `role` is granted `permission` by the matrix. */
export function roleHasPermission(
  role: UserRole,
  permission: Permission,
): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
