import { Router, type Request, type Response } from "express";
import { ZodError, z } from "zod";
import { prisma } from "../lib/prisma";
import { createInstitutionService } from "../services/institution.service";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { AppError, sendError, sendSuccess, ValidationError } from "../lib/http";
import { PERMISSIONS } from "../../shared/constants/permissions";
import {
  CreateInstitutionRequestSchema,
  ListInstitutionsQuerySchema,
  UpdateInstitutionRequestSchema,
} from "../../shared/schemas/institution";

/**
 * Institution routes: the CRUD surface from the API spec's Institutions
 * section — GET/POST /institutions, GET/PATCH/DELETE /institutions/:id.
 *
 * Handlers stay thin — validate the request, delegate to the institution
 * service, and shape the standard response envelope (mirrors the auth routes).
 *
 * Authorization: every endpoint is "super-admin only" per the spec. That is
 * enforced through the RBAC permission matrix, where the institution
 * permissions are granted solely to the dedicated `super_admin` role — an
 * institution-scoped `admin` cannot manage the global registry (see
 * shared/constants/permissions.ts).
 */

const router = Router();
const institutionService = createInstitutionService(prisma);

/**
 * Parse the `:id` route param as a UUID. Institution ids are UUIDs end-to-end,
 * so a malformed value is a client error: it throws a ZodError that `handleError`
 * maps to a 400 VALIDATION_ERROR, rather than reaching Prisma and surfacing as a
 * 500.
 */
const IdParamSchema = z.string().uuid("Invalid institution id");

function institutionId(req: Request): string {
  return IdParamSchema.parse(req.params.id);
}

/** Map thrown errors to the response envelope with the right status. */
function handleError(res: Response, error: unknown): void {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    sendError(res, 400, "VALIDATION_ERROR", "Invalid input", details);
    return;
  }
  if (error instanceof AppError) {
    const details = error instanceof ValidationError ? error.details : undefined;
    sendError(res, error.status, error.code, error.message, details);
    return;
  }
  console.error("Unexpected institution route error:", error);
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}

// GET /institutions — list institutions (super-admin only).
router.get(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.INSTITUTION_LIST),
  async (req: Request, res: Response) => {
    try {
      const query = ListInstitutionsQuerySchema.parse(req.query);
      const { institutions, page, limit, total } =
        await institutionService.list(query);
      sendSuccess(res, institutions, 200, { page, limit, total });
    } catch (error) {
      handleError(res, error);
    }
  },
);

// POST /institutions — create institution (super-admin only).
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.INSTITUTION_CREATE),
  async (req: Request, res: Response) => {
    try {
      const data = CreateInstitutionRequestSchema.parse(req.body);
      const institution = await institutionService.create(data);
      sendSuccess(res, institution, 201);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// GET /institutions/:id — get institution details.
router.get(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.INSTITUTION_GET),
  async (req: Request, res: Response) => {
    try {
      const institution = await institutionService.getById(institutionId(req));
      sendSuccess(res, institution, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// PATCH /institutions/:id — update institution settings.
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.INSTITUTION_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const data = UpdateInstitutionRequestSchema.parse(req.body);
      const institution = await institutionService.update(
        institutionId(req),
        data,
      );
      sendSuccess(res, institution, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// DELETE /institutions/:id — soft-delete institution.
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.INSTITUTION_DELETE),
  async (req: Request, res: Response) => {
    try {
      const id = institutionId(req);
      await institutionService.softDelete(id);
      sendSuccess(res, { id, deleted: true }, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

export default router;
