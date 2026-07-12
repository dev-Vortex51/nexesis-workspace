import { Router, type Request, type Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { ZodError } from "zod";
import { auth } from "../auth";
import { prisma } from "../lib/prisma";
import { createAuthService } from "../services/auth.service";
import { requireAuth, requireRole } from "../middleware/auth";
import { AppError, sendError, sendSuccess, ValidationError } from "../lib/http";
import {
  LoginRequestSchema,
  RegisterRequestSchema,
  UpdateProfileRequestSchema,
} from "../../shared/schemas/auth";

/**
 * Auth routes: POST /register, POST /login, GET /me, PATCH /me.
 *
 * Handlers stay thin — validate the request, delegate to the auth service, and
 * shape the standard response envelope. The httpOnly session cookie set by
 * Better Auth is forwarded from the service's auth response onto the Express
 * response so the browser receives it.
 */

const router = Router();
const authService = createAuthService(auth, prisma);

/** Copy the Set-Cookie header(s) from a Better Auth response onto Express res. */
function forwardAuthCookies(from: globalThis.Response, res: Response): void {
  const cookies = from.headers.getSetCookie();
  if (cookies.length > 0) {
    res.setHeader("Set-Cookie", cookies);
  }
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
  console.error("Unexpected auth route error:", error);
  sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
}

// POST /auth/register — admin-only account provisioning (see API spec).
// Guards: authenticated + admin role; the created user is scoped to the
// admin's own institution. Registration never establishes a session for the
// caller, so no cookie is forwarded — the new user signs in via /login.
router.post(
  "/register",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const data = RegisterRequestSchema.parse(req.body);

      // Tenant isolation: an admin may only provision within their own
      // institution. Reject cross-institution attempts rather than silently
      // overriding, so the mismatch is visible to the caller.
      if (data.institutionId !== req.user!.institutionId) {
        sendError(
          res,
          403,
          "FORBIDDEN",
          "Cannot create a user for another institution",
        );
        return;
      }

      const user = await authService.register(data);
      sendSuccess(res, user, 201);
    } catch (error) {
      handleError(res, error);
    }
  },
);

// POST /auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const data = LoginRequestSchema.parse(req.body);
    const { user, authResponse } = await authService.login(data);
    forwardAuthCookies(authResponse, res);
    sendSuccess(res, user, 200);
  } catch (error) {
    handleError(res, error);
  }
});

// GET /auth/me
router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await authService.getCurrentUser(fromNodeHeaders(req.headers));
    sendSuccess(res, user, 200);
  } catch (error) {
    handleError(res, error);
  }
});

// PATCH /auth/me
router.patch("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = UpdateProfileRequestSchema.parse(req.body);
    // requireAuth guarantees req.user is populated.
    const user = await authService.updateProfile(req.user!.id, data);
    sendSuccess(res, user, 200);
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
