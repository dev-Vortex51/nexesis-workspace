import { z } from "zod";
import {
  USER_ROLES,
  USER_STATUSES,
  UserResponseSchema,
} from "./auth";

/**
 * User request/response schemas.
 *
 * These validate the HTTP boundary for the user management routes and are the
 * single source of truth for user payload shapes (mirrors the department/
 * session schema pattern). They map directly to the API spec's Users section
 * (GET/POST /users, GET/PATCH/DELETE /users/:id) and the User entity in the
 * data model — nothing beyond those fields.
 *
 * The public user shape is `UserResponse` (defined once in ./auth and reused
 * here — no duplicated type, per code standards). Credentials are never part of
 * any user payload: passwords are handled by Better Auth (Account table), and
 * mfaSecret is never exposed.
 *
 * `institutionId` is never accepted from the client on create/update — it is
 * always taken from the authenticated caller's session so users cannot be
 * created or read across tenant boundaries (same convention as departments and
 * sessions).
 */

const FirstNameSchema = z
  .string()
  .trim()
  .min(1, "First name is required")
  .max(100, "First name must be at most 100 characters");

const LastNameSchema = z
  .string()
  .trim()
  .min(1, "Last name is required")
  .max(100, "Last name must be at most 100 characters");

// Mirrors the credential bounds enforced by Better Auth (server/auth.ts:
// minPasswordLength 8 / maxPasswordLength 128) and the register schema.
const PasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

const RoleSchema = z.enum(USER_ROLES);
const StatusSchema = z.enum(USER_STATUSES);
const DepartmentIdSchema = z.string().uuid("Invalid department ID");

/**
 * POST /users — "Create user (admin only)." The spec gives no explicit body, so
 * the client-settable fields are derived from the User entity (04-data-model.md):
 * email, password (credential), firstName, lastName, role, departmentId.
 * `institutionId` is injected from the session, not the body. Unlike public
 * registration (which forces role "student"), an admin sets the role here —
 * this is the "role assignment" the unit's scope calls for. `departmentId` is
 * the "department assignment".
 */
export const CreateUserRequestSchema = z
  .object({
    email: z.string().email("Invalid email format"),
    password: PasswordSchema,
    firstName: FirstNameSchema,
    lastName: LastNameSchema,
    role: RoleSchema,
    departmentId: DepartmentIdSchema.nullable().optional(),
  })
  .strict();

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

/**
 * PATCH /users/:id — "Update user (admin or self)." A strict partial. The
 * base fields (firstName, lastName, departmentId) may be changed by the user
 * themselves or an admin; `role` and `status` are privileged and only an admin
 * may change them (enforced in the service via the `isAdmin` flag — a self
 * update that carries them is rejected so a user cannot escalate their own
 * role or reactivate a suspended account).
 */
export const UpdateUserRequestSchema = z
  .object({
    firstName: FirstNameSchema.optional(),
    lastName: LastNameSchema.optional(),
    departmentId: DepartmentIdSchema.nullable().optional(),
    role: RoleSchema.optional(),
    status: StatusSchema.optional(),
  })
  .strict();

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

/**
 * GET /users — filtering + pagination query per the spec:
 * role, departmentId, status, search (name or email), page, limit.
 */
export const ListUsersQuerySchema = z.object({
  role: RoleSchema.optional(),
  departmentId: DepartmentIdSchema.optional(),
  status: StatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

/**
 * A project summary attached to a user's profile. Every field is a direct
 * Project column from the data model — no computed/invented data.
 */
export const UserProjectSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  currentStage: z.string(),
  stageStatus: z.string(),
  progress: z.number().int(),
});

export type UserProjectSummary = z.infer<typeof UserProjectSummarySchema>;

/**
 * GET /users/:id — "Get user profile with role-specific data." Extends the base
 * user response with `roleData`, the project associations the data model defines
 * for the user's role:
 *  - a student's own projects (Project.studentId), and
 *  - the projects a supervisor/examiner is assigned to (ProjectMember.userId).
 * Only the branch relevant to the user's role is populated; the other is empty.
 * This is purely relational data from the model — no workflow logic is invented.
 */
export const UserDetailResponseSchema = UserResponseSchema.extend({
  roleData: z.object({
    projects: z.array(UserProjectSummarySchema),
    supervisedProjects: z.array(UserProjectSummarySchema),
  }),
});

export type UserDetailResponse = z.infer<typeof UserDetailResponseSchema>;
