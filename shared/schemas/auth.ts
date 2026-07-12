import { z } from "zod";

/**
 * Auth request/response schemas.
 *
 * These validate the HTTP boundary for the auth routes and are the single
 * source of truth for auth payload shapes shared between server and client.
 * They mirror the bodies defined in the API spec (POST /auth/register,
 * POST /auth/login, GET /auth/me, PATCH /auth/me). Credentials themselves are
 * handled by Better Auth; these schemas only guard the data our routes accept.
 */

export const USER_ROLES = [
  "student",
  "supervisor",
  "coordinator",
  "hod",
  "admin",
  "examiner",
] as const;

export const USER_STATUSES = ["active", "suspended", "inactive"] as const;

// POST /auth/register
export const RegisterRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  institutionId: z.string().uuid("Invalid institution ID"),
  departmentId: z.string().uuid("Invalid department ID").nullable().optional(),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

// POST /auth/login
export const LoginRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z
    .string()
    .min(1, "Password is required")
    .max(128, "Password must be at most 128 characters"),
  mfaCode: z
    .string()
    .length(6, "MFA code must be 6 digits")
    .nullable()
    .optional(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

// PATCH /auth/me
export const UpdateProfileRequestSchema = z
  .object({
    firstName: z.string().min(1, "First name is required").optional(),
    lastName: z.string().min(1, "Last name is required").optional(),
    departmentId: z
      .string()
      .uuid("Invalid department ID")
      .nullable()
      .optional(),
  })
  .strict();

export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/**
 * Public shape of a user returned by the auth endpoints. Never includes
 * credentials or MFA secrets.
 */
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(USER_ROLES),
  institutionId: z.string().uuid(),
  departmentId: z.string().uuid().nullable(),
  status: z.enum(USER_STATUSES),
  mfaEnabled: z.boolean(),
  emailVerified: z.boolean(),
  // Dates cross the HTTP boundary as ISO datetime strings; coerce them back to
  // Date so payloads parse while the UserResponse contract stays Date-typed.
  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

/**
 * The authenticated principal attached to a request by the auth middleware,
 * derived from the Better Auth session.
 */
export interface SessionUser {
  id: string;
  email: string;
  role: (typeof USER_ROLES)[number];
  institutionId: string;
  departmentId: string | null;
}

// ── Response envelope ────────────────────────────────────────────────────────
// Standard API envelope from the API spec: { success, data, error, meta? }.

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorResponse {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  error: null;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}
