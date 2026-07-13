import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import { createDepartmentService } from "../services/department.service";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { AppError, sendError, sendSuccess, ValidationError } from "../lib/http";
import { PERMISSIONS } from "../../shared/constants/permissions";
import {
  CreateDepartmentRequestSchema,
  ListDepartmentsQuerySchema,
  UpdateDepartmentRequestSchema,
} from "../../shared/schemas/department";

/**
 * Department routes: the CRUD surface from the API spec's Departments section —
 * GET/POST /departments, GET/PATCH/DELETE /departments/:id.
 *
 * Handlers stay thin — validate the request, delegate to the department
 * service, and shape the standard response envelope (mirrors the institution
 * routes).
 *
 * Authorization:
 *  - POST /departments is "admin only" per the spec → DEPARTMENT_CREATE
 *    permission (granted to admin in the RBAC matrix).
 *  - The spec attaches no role annotation to list/get/update/delete, so those
 *    require only authentication; every service call is scoped to the caller's
 *    institutionId (from the session), which enforces tenant isolation — a
 *    department in another institution reads as absent (404).
 */

const router = Router();
const departmentService = createDepartmentService(prisma);

/** Read the `:id` route param as a plain string (Express 5 types it wider). */
function departmentId(req: Request): string {
  return String(req.params.id);
}

/** The authenticated caller's institution — the tenant scope for every query. */
function callerInstitutionId(req: Request): string {
  return String(req.user?.institutionId);
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
  console.error("Unexpected department route error:", error);
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}

// GET /departments — list departments for the caller's institution.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const query = ListDepartmentsQuerySchema.parse(req.query);
    const { departments, page, limit, total } = await departmentService.list(
      callerInstitutionId(req),
      query,
    );
    sendSuccess(res, departments, 200, { page, limit, total });
  } catch (error) {
    handleError(res, error);
  }
});

// POST /departments — create department (admin only).
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.DEPARTMENT_CREATE),
  async (req: Request, res: Response) => {
    try {
      const data = CreateDepartmentRequestSchema.parse(req.body);
      const department = await departmentService.create(
        callerInstitutionId(req),
        data,
      );
      sendSuccess(res, department, 201);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// GET /departments/:id — get department with user count and project stats.
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const department = await departmentService.getById(
      callerInstitutionId(req),
      departmentId(req),
    );
    sendSuccess(res, department, 200);
  } catch (error) {
    handleError(res, error);
  }
});

// PATCH /departments/:id — update department.
router.patch("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = UpdateDepartmentRequestSchema.parse(req.body);
    const department = await departmentService.update(
      callerInstitutionId(req),
      departmentId(req),
      data,
    );
    sendSuccess(res, department, 200);
  } catch (error) {
    handleError(res, error);
  }
});

// DELETE /departments/:id — delete department (if no active projects).
router.delete("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const id = departmentId(req);
    await departmentService.delete(callerInstitutionId(req), id);
    sendSuccess(res, { id, deleted: true }, 200);
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
