import { z } from "zod";

/**
 * Department request/response schemas.
 *
 * These validate the HTTP boundary for the department CRUD routes and are the
 * single source of truth for department payload shapes (mirrors the institution
 * schemas pattern). They map directly to the API spec's Departments section
 * (GET/POST /departments, GET/PATCH/DELETE /departments/:id) and the Department
 * entity in the data model — nothing beyond those fields.
 *
 * The Department entity (04-data-model.md) has exactly: id, institutionId, name,
 * code, createdAt. `institutionId` is never accepted from the client — it is
 * always taken from the authenticated caller's session so departments cannot be
 * created or read across tenant boundaries.
 */

// A department code is a short human identifier (e.g. "CSC", "MEE"). The data
// model constrains only "not null"; keep validation minimal — non-empty and
// length-bounded — without inventing a format the spec does not define.
export const DepartmentCodeSchema = z
  .string()
  .trim()
  .min(1, "Code is required")
  .max(32, "Code must be at most 32 characters");

export const DepartmentNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name must be at most 200 characters");

// POST /departments — body per the API spec: { name, code }. institutionId is
// injected from the session, not the body.
export const CreateDepartmentRequestSchema = z
  .object({
    name: DepartmentNameSchema,
    code: DepartmentCodeSchema,
  })
  .strict();

export type CreateDepartmentRequest = z.infer<
  typeof CreateDepartmentRequestSchema
>;

// PATCH /departments/:id — partial update over the department's mutable columns
// (name, code). All fields optional; unknown keys rejected.
export const UpdateDepartmentRequestSchema = z
  .object({
    name: DepartmentNameSchema.optional(),
    code: DepartmentCodeSchema.optional(),
  })
  .strict();

export type UpdateDepartmentRequest = z.infer<
  typeof UpdateDepartmentRequestSchema
>;

// GET /departments — optional pagination query params for the list envelope.
export const ListDepartmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListDepartmentsQuery = z.infer<typeof ListDepartmentsQuerySchema>;

/** Public shape of a department returned by the list/create/update endpoints. */
export const DepartmentResponseSchema = z.object({
  id: z.string().uuid(),
  institutionId: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  // Dates cross the HTTP boundary as ISO strings; coerce back to Date so the
  // contract stays Date-typed (same convention as the institution schemas).
  createdAt: z.coerce.date(),
});

export type DepartmentResponse = z.infer<typeof DepartmentResponseSchema>;

/**
 * GET /departments/:id — "department with user count and project stats" per the
 * API spec. Extends the base response with aggregate counts.
 *
 * `projectStats.active` counts projects that have not been archived
 * (archivedAt IS NULL), matching the delete guard's notion of an active project
 * ("Delete department (if no active projects)").
 */
export const DepartmentDetailResponseSchema = DepartmentResponseSchema.extend({
  userCount: z.number().int().nonnegative(),
  projectStats: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
  }),
});

export type DepartmentDetailResponse = z.infer<
  typeof DepartmentDetailResponseSchema
>;
