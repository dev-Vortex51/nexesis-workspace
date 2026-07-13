import { Router, type Request, type Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma";
import { createSessionService } from "../services/session.service";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/rbac";
import { AppError, sendError, sendSuccess, ValidationError } from "../lib/http";
import { PERMISSIONS } from "../../shared/constants/permissions";
import {
  CreateSessionRequestSchema,
  ListSessionsQuerySchema,
  UpdateSessionRequestSchema,
} from "../../shared/schemas/session";

/**
 * Academic session routes: the surface from the API spec's Academic Sessions
 * section — GET/POST /sessions, GET/PATCH /sessions/:id,
 * POST /sessions/:id/activate, POST /sessions/:id/close.
 *
 * Handlers stay thin — validate the request, delegate to the session service,
 * and shape the standard response envelope (mirrors the department routes).
 *
 * Authorization:
 *  - POST /sessions is "coordinator/admin" per the spec → SESSION_CREATE.
 *  - This unit's scope ("Enforce Coordinator and Admin authorization") extends
 *    the same gate to the other management writes: PATCH /sessions/:id
 *    (SESSION_UPDATE), POST /sessions/:id/activate (SESSION_ACTIVATE), and
 *    POST /sessions/:id/close (SESSION_CLOSE).
 *  - The reads (GET /sessions, GET /sessions/:id) carry no role annotation, so
 *    they require only authentication; every service call is scoped to the
 *    caller's institutionId (from the session), enforcing tenant isolation — a
 *    session in another institution reads as absent (404).
 */

const router = Router();
const sessionService = createSessionService(prisma);

/** Read the `:id` route param as a plain string (Express 5 types it wider). */
function sessionId(req: Request): string {
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
  console.error("Unexpected session route error:", error);
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}

// GET /sessions — list sessions for the caller's institution.
router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const query = ListSessionsQuerySchema.parse(req.query);
    const { sessions, page, limit, total } = await sessionService.list(
      callerInstitutionId(req),
      query,
    );
    sendSuccess(res, sessions, 200, { page, limit, total });
  } catch (error) {
    handleError(res, error);
  }
});

// POST /sessions — create session (coordinator/admin).
router.post(
  "/",
  requireAuth,
  requirePermission(PERMISSIONS.SESSION_CREATE),
  async (req: Request, res: Response) => {
    try {
      const data = CreateSessionRequestSchema.parse(req.body);
      const session = await sessionService.create(
        callerInstitutionId(req),
        data,
      );
      sendSuccess(res, session, 201);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// GET /sessions/:id — get session with project counts and completion stats.
router.get("/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const session = await sessionService.getById(
      callerInstitutionId(req),
      sessionId(req),
    );
    sendSuccess(res, session, 200);
  } catch (error) {
    handleError(res, error);
  }
});

// PATCH /sessions/:id — update session (coordinator/admin).
router.patch(
  "/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SESSION_UPDATE),
  async (req: Request, res: Response) => {
    try {
      const data = UpdateSessionRequestSchema.parse(req.body);
      const session = await sessionService.update(
        callerInstitutionId(req),
        sessionId(req),
        data,
      );
      sendSuccess(res, session, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// POST /sessions/:id/activate — activate session, closing the previous active
// session (coordinator/admin).
router.post(
  "/:id/activate",
  requireAuth,
  requirePermission(PERMISSIONS.SESSION_ACTIVATE),
  async (req: Request, res: Response) => {
    try {
      const session = await sessionService.activate(
        callerInstitutionId(req),
        sessionId(req),
      );
      sendSuccess(res, session, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// POST /sessions/:id/close — close session, no new projects (coordinator/admin).
router.post(
  "/:id/close",
  requireAuth,
  requirePermission(PERMISSIONS.SESSION_CLOSE),
  async (req: Request, res: Response) => {
    try {
      const session = await sessionService.close(
        callerInstitutionId(req),
        sessionId(req),
      );
      sendSuccess(res, session, 200);
    } catch (error) {
      handleError(res, error);
    }
  },
);

export default router;
