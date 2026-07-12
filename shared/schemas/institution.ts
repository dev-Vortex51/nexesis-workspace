import { z } from "zod";

/**
 * Institution request/response schemas.
 *
 * These validate the HTTP boundary for the institution CRUD routes and are the
 * single source of truth for institution payload shapes (mirrors the auth
 * schemas pattern). They map directly to the API spec's Institutions section
 * (GET/POST /institutions, GET/PATCH/DELETE /institutions/:id) and the
 * Institution entity in the data model — nothing beyond those fields.
 */

// Institution.subscriptionTier enum (04-data-model.md → Institution).
export const SUBSCRIPTION_TIERS = ["free", "standard", "enterprise"] as const;

/**
 * Slug validation. A slug is, by definition, a lowercase URL-safe identifier:
 * alphanumeric segments joined by single hyphens, with no leading/trailing or
 * doubled hyphens. The data model requires slugs to be unique and non-null;
 * uniqueness is enforced at the database layer (mapped to CONFLICT).
 */
export const InstitutionSlugSchema = z
  .string()
  .min(1, "Slug is required")
  .max(100, "Slug must be at most 100 characters")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Slug must be lowercase alphanumeric words separated by single hyphens",
  );

// The settings JSONB field: an arbitrary institution-specific config object.
export const InstitutionSettingsSchema = z.record(z.string(), z.unknown());

// POST /institutions — body per the API spec: { name, slug, settings }.
// subscriptionTier is not part of the create body (the spec omits it); the
// service defaults it to the first tier, "free".
export const CreateInstitutionRequestSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    slug: InstitutionSlugSchema,
    settings: InstitutionSettingsSchema.optional(),
  })
  .strict();

export type CreateInstitutionRequest = z.infer<
  typeof CreateInstitutionRequestSchema
>;

// PATCH /institutions/:id — partial update over the institution's mutable
// columns. All fields optional; unknown keys rejected.
export const UpdateInstitutionRequestSchema = z
  .object({
    name: z.string().min(1, "Name is required").optional(),
    slug: InstitutionSlugSchema.optional(),
    logoUrl: z.string().nullable().optional(),
    settings: InstitutionSettingsSchema.optional(),
    subscriptionTier: z.enum(SUBSCRIPTION_TIERS).optional(),
  })
  .strict();

export type UpdateInstitutionRequest = z.infer<
  typeof UpdateInstitutionRequestSchema
>;

// GET /institutions — optional pagination query params for the list envelope.
export const ListInstitutionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type ListInstitutionsQuery = z.infer<typeof ListInstitutionsQuerySchema>;

/** Public shape of an institution returned by the institution endpoints. */
export const InstitutionResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  settings: InstitutionSettingsSchema,
  subscriptionTier: z.enum(SUBSCRIPTION_TIERS),
  // Dates cross the HTTP boundary as ISO strings; coerce back to Date so the
  // contract stays Date-typed (same convention as the auth schemas).
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type InstitutionResponse = z.infer<typeof InstitutionResponseSchema>;
