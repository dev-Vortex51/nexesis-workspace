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

// The reserved settings key that historically marked a soft-deleted row. Soft
// delete now lives in a dedicated column, but the key stays reserved: a client
// must never be able to write it, so it is rejected at the schema boundary
// (and stripped again in the service before persisting) — otherwise a public
// create/PATCH could smuggle internal state into the settings JSONB.
export const RESERVED_SETTINGS_KEYS = ["_deletedAt"] as const;

// The settings JSONB field: an arbitrary institution-specific config object,
// minus the reserved internal keys above.
export const InstitutionSettingsSchema = z
  .record(z.string(), z.unknown())
  .superRefine((settings, ctx) => {
    for (const key of RESERVED_SETTINGS_KEYS) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `"${key}" is a reserved key and cannot be set`,
        });
      }
    }
  });

// Institution name: trimmed so whitespace-only input (" ") is rejected rather
// than passing a bare min(1) check, and length-bounded like the other entities.
export const InstitutionNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Name must be at most 200 characters");

// POST /institutions — body per the API spec: { name, slug, settings }.
// subscriptionTier is not part of the create body (the spec omits it); the
// service defaults it to the first tier, "free".
export const CreateInstitutionRequestSchema = z
  .object({
    name: InstitutionNameSchema,
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
    name: InstitutionNameSchema.optional(),
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
