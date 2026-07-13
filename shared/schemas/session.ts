import { z } from "zod";

/**
 * Academic session request/response schemas.
 *
 * These validate the HTTP boundary for the academic-session routes and are the
 * single source of truth for session payload shapes (mirrors the institution/
 * department schemas pattern). They map directly to the API spec's Academic
 * Sessions section (GET/POST /sessions, GET/PATCH /sessions/:id,
 * POST /sessions/:id/activate, POST /sessions/:id/close) and the AcademicSession
 * entity in the data model — nothing beyond those fields.
 *
 * The AcademicSession entity (04-data-model.md) has exactly: id, institutionId,
 * name, startDate, endDate, status, settings, createdAt. `institutionId` is
 * never accepted from the client — it is always taken from the authenticated
 * caller's session so sessions cannot be created or read across tenants.
 * `status` is never set through create/update: it is owned by the dedicated
 * activate/close transitions, and new sessions begin in "planning".
 */

// AcademicSession.status enum (04-data-model.md → AcademicSession).
export const SESSION_STATUSES = [
  "planning",
  "active",
  "closed",
  "archived",
] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SessionNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name must be at most 200 characters");

// A permissive ISO date string (accepts date-only "2025-09-01" or full ISO
// timestamps). Used for the settings deadlines, which are stored verbatim in the
// JSONB column. Kept to basic parse-ability — no business rule is invented.
export const IsoDateStringSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Must be a valid ISO date");

/**
 * The settings JSONB field: "Session-specific deadlines". The API spec's create
 * body documents two deadline keys; both are optional and validated as ISO date
 * strings. Additional keys pass through untouched (catchall) so the field stays
 * an open config object without inventing a closed schema.
 */
export const SessionSettingsSchema = z
  .object({
    topicProposalDeadline: IsoDateStringSchema.optional(),
    finalSubmissionDeadline: IsoDateStringSchema.optional(),
  })
  .catchall(z.unknown());

export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

// POST /sessions — body per the API spec: { name, startDate, endDate, settings }.
// startDate/endDate are ISO dates coerced to Date for storage; settings is
// optional (defaults to {} in the service). institutionId comes from the
// session, and status defaults to "planning" — neither is accepted here.
export const CreateSessionRequestSchema = z
  .object({
    name: SessionNameSchema,
    startDate: z.coerce.date({ message: "startDate must be a valid date" }),
    endDate: z.coerce.date({ message: "endDate must be a valid date" }),
    settings: SessionSettingsSchema.optional(),
  })
  .strict();

export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

// PATCH /sessions/:id — partial update over the session's mutable columns.
// `status` is intentionally excluded (state changes go through activate/close);
// unknown keys are rejected.
export const UpdateSessionRequestSchema = z
  .object({
    name: SessionNameSchema.optional(),
    startDate: z.coerce
      .date({ message: "startDate must be a valid date" })
      .optional(),
    endDate: z.coerce
      .date({ message: "endDate must be a valid date" })
      .optional(),
    settings: SessionSettingsSchema.optional(),
  })
  .strict();

export type UpdateSessionRequest = z.infer<typeof UpdateSessionRequestSchema>;

// GET /sessions — optional pagination query params for the list envelope.
export const ListSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

/** Public shape of a session returned by the list/create/update/transition endpoints. */
export const SessionResponseSchema = z.object({
  id: z.string().uuid(),
  institutionId: z.string().uuid(),
  name: z.string(),
  // Dates cross the HTTP boundary as ISO strings; coerce back to Date so the
  // contract stays Date-typed (same convention as the other schemas).
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z.enum(SESSION_STATUSES),
  settings: SessionSettingsSchema,
  createdAt: z.coerce.date(),
});

export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/**
 * GET /sessions/:id — "session with project counts and completion stats" per the
 * API spec. Extends the base response with aggregate project counts and a
 * completion rate.
 *
 * `projectCounts.active` counts non-archived projects (archivedAt IS NULL) — the
 * same notion of "active" used across the domain; `projectCounts.completed`
 * counts projects with a completedAt timestamp. `completionRate` is the
 * completed/total percentage (0 when there are no projects).
 */
export const SessionDetailResponseSchema = SessionResponseSchema.extend({
  projectCounts: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  completionRate: z.number().min(0).max(100),
});

export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;
