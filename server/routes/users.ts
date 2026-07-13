import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { auth } from "../auth";
import { prisma } from "../lib/prisma";
import { createUserService } from "../services/user.service";
import {
  AssignSupervisorRequestSchema,
  createSupervisorService,
} from "../services/supervisor.service";
import { requireAuth } from "../middleware/auth";
import { can, requireOwnership, requirePermission } from "../middleware/rbac";
import { AppError, sendError, sendSuccess, ValidationError } from "../lib/http";
import { PERMISSIONS } from "../../shared/constants/permissions";
import {
  CreateUserRequestSchema,
  ListUsersQuerySchema,
  UpdateUserRequestSchema,
} from "../../shared/schemas/user";

/**
 * User routes: the CRUD surface from the API spec's Users section —
 * GET/POST /users, GET/PATCH/DELETE /users/:id, plus
 * POST /users/:id/assign-supervisor.
 *
 * Handlers stay thin — validate the request, delegate to the user service, and
 * shape the standard response envelope (mirrors the department routes).
 *
 * Authorization (from the spec's per-endpoint annotations):
 *  - POST /users is "admin only" → USER_CREATE permission.
 *  - DELETE /users/:id (suspend) is "admin only" → USER_SUSPEND permission.
 *  - PATCH /users/:id is "admin or self" → requireOwnership over the target
 *    user id, with USER_UPDATE_ANY as the admin bypass. Role/status changes are
 *    further restricted to admins inside the service (a self update cannot
 *    escalate its own role).
 *  - POST /users/:id/assign-supervisor is "coordinator/admin" →
 *    USER_ASSIGN_SUPERVISOR permission; the assignment mechanics live in the
 *    supervisor service (unit 1.5).
 *  - GET /users and GET /users/:id carry no role annotation, so they require
 *    only authentication; every service call is scoped to the caller's
 *    institutionId (from the session), enforcing tenant isolation — a user in
 *    another institution reads as absent (404).
 */

const router = Router();
const userService = createUserService(auth, prisma);
const supervisorService = createSupervisorService(prisma);

/** Read the `:id` route param as a plain string (Express 5 types it wider). */
function userId(req: Request): string {
  return String(req.params.id);
}

/** The authenticated caller's institution — the tenant scope for every query. */
function callerInstitutionId(req: Request): string {
  return String(req.user?.institutionId);
}

/**
 * Owner resolver for a user resource: the "owner" of a user is that user. Scoped
 * to the caller's institution so a cross-tenant (or unknown) id resolves to
 * null → 404 rather than leaking existence. Returns the target user's id when it
 * exists in the caller's institution.
 */
async function resolveUserOwner(req: Request): Promise<string | null> {
  const target = await prisma.user.findUnique({
    where: { id: userId(req) },
    select: { id: true, institutionId: true },
  });
  if (!target || target.institutionId !== callerInstitutionId(req)) {
    return null;
  }
  return target.id;
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
  console.error("Unexpected user route error:", error);
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}

// GET /users — list users for the caller's institution with filtering.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const query = ListUsersQuerySchema.parse(req.query);
    const { users, page, limit, total } = await userService.list(
      callerInstitutionId(req),
      query,
    );
    sendSuccess(res, users, 200, { page, limit, total });
  } catch (error) {
    handleError(res, error);
  }
});

// POST /users — create user (admin only).
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.USER_CREATE),
  async (req: Request, res: Response) => {
    try {
      const data = CreateUserRequestSchema.parse(req.body);
      const user = await userService.create(callerInstitutionId(req), data);
      sendSuccess(res, user, 201);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// GET /users/:id — get user profile with role-specific data.
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await userService.getById(
      callerInstitutionId(req),
      userId(req),
    );
    sendSuccess(res, user, 200);
  } catch (error) {
    handleError(res, error);
  }
});

// PATCH /users/:id — update user (admin or self).
router.patch(
  "/:id",
  requireAuth,
  requireOwnership(resolveUserOwner, PERMISSIONS.USER_UPDATE_ANY),
  async (req: Request, res: Response) => {
    try {
      const data = UpdateUserRequestSchema.parse(req.body);
      const user = await userService.update(
        callerInstitutionId(req),
        userId(req),
        data,
        can(req.user!, PERMISSIONS.USER_UPDATE_ANY),
      );
      sendSuccess(res, user, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// DELETE /users/:id — suspend user (admin only).
router.delete(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.USER_SUSPEND),
  async (req: Request, res: Response) => {
    try {
      const user = await userService.suspend(
        callerInstitutionId(req),
        userId(req),
      );
      sendSuccess(res, user, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// POST /users/:id/assign-supervisor — assign supervisor to a student
// (coordinator/admin). The `:id` is the student; the body carries the
// supervisor. All entities are resolved within the caller's institution.
router.post(
  "/:id/assign-supervisor",
  requireAuth,
  requirePermission(PERMISSIONS.USER_ASSIGN_SUPERVISOR),
  async (req: Request, res: Response) => {
    try {
      const { supervisorId } = AssignSupervisorRequestSchema.parse(req.body);
      const result = await supervisorService.assignToStudent(
        callerInstitutionId(req),
        userId(req),
        supervisorId,
      );
      sendSuccess(res, result, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

export default router;
