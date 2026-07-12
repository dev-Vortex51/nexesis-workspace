import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../auth";
import { sendError } from "../lib/http";
import type { SessionUser } from "../../shared/schemas/auth";

/**
 * Authentication middleware.
 *
 * Validates the Better Auth session carried by the httpOnly cookie on each
 * request and attaches the authenticated principal to `req.user`. Role and
 * institution helpers back the RBAC layer built in unit 0.4.
 */

// Augment Express's Request with the authenticated principal.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/**
 * Resolve the Better Auth session from an Express request's headers. Returns
 * the session user, or null when there is no valid session.
 */
export async function resolveSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session?.user) return null;

  const user = session.user as typeof session.user & {
    role: SessionUser["role"];
    institutionId: string;
    departmentId: string | null;
  };

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    departmentId: user.departmentId ?? null,
  };
}

/**
 * Guard that rejects unauthenticated requests with a 401 envelope and,
 * otherwise, populates `req.user` before handing off to the route.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const user = await resolveSessionUser(req);
    if (!user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    req.user = user;
    next();
  } catch {
    sendError(res, 401, "UNAUTHORIZED", "Authentication required");
  }
}

/** True when the user holds one of the required roles. */
export function hasRole(
  user: SessionUser,
  requiredRoles: readonly string[],
): boolean {
  return requiredRoles.includes(user.role);
}

/**
 * Guard that requires the authenticated user to hold one of `roles`. Must run
 * after `requireAuth` (which populates `req.user`); responds 403 otherwise.
 * A fuller permission matrix is built in unit 0.4 — this is the minimal role
 * gate needed to enforce the API spec's admin-only mutations.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    if (!hasRole(req.user, roles)) {
      sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
      return;
    }
    next();
  };
}

/** True when the user belongs to the given institution. */
export function belongsToInstitution(
  user: SessionUser,
  institutionId: string,
): boolean {
  return user.institutionId === institutionId;
}
