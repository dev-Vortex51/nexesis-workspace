import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http";
import type { SessionUser } from "../../shared/schemas/auth";
import {
  roleHasPermission,
  type Permission,
  type UserRole,
} from "../../shared/constants/permissions";

/**
 * Role-based access control middleware (unit 0.4).
 *
 * Builds on the authentication layer (`requireAuth`, which populates
 * `req.user`) with two enforcement primitives that every protected route in
 * the API spec is expressed in terms of:
 *
 *  1. `requirePermission` — static role gate, driven by the permission matrix
 *     in `shared/constants/permissions.ts` (the single source of truth for
 *     which roles may perform which action).
 *  2. `requireOwnership` — dynamic resource-ownership gate for actions the spec
 *     restricts to a resource's owner (e.g. "author only", "organizer only",
 *     "assessor only", "admin or self"), with an optional permission that lets
 *     privileged roles bypass the ownership check.
 *
 * Every middleware here must run AFTER `requireAuth`; each independently
 * rejects an unauthenticated request with 401 as a defensive guard.
 */

/** True when the user holds `permission` per the RBAC matrix. */
export function can(user: SessionUser, permission: Permission): boolean {
  return roleHasPermission(user.role as UserRole, permission);
}

/**
 * Guard that requires the authenticated user's role to be granted
 * `permission`. Responds 401 if unauthenticated, 403 if the role lacks the
 * permission. Matches the spec's role-gated routes (admin-only, coordinator/
 * admin, supervisor-only, etc.).
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }
    if (!can(req.user, permission)) {
      sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
      return;
    }
    next();
  };
}

/**
 * Resolves the id of the user who owns the resource targeted by a request.
 * Returns null when the resource does not exist or has no owner. Each route
 * supplies its own resolver (e.g. look up the feedback author, the meeting
 * organizer, or read `req.params.id` for self-scoped user routes), keeping the
 * middleware decoupled from the data layer.
 */
export type OwnerResolver = (req: Request) => Promise<string | null>;

/**
 * Guard for ownership-scoped actions. Allows the request when the authenticated
 * user owns the resource (as reported by `resolveOwnerId`) OR — when
 * `bypassPermission` is provided — when the user's role holds that permission
 * (the administrative override the spec expresses as "author or admin", "admin
 * or self", etc.).
 *
 * Responds 401 if unauthenticated and 403 if the user is neither the owner
 * nor a permitted override. A resolver that returns `null` (resource absent /
 * no owner) yields 404; an unexpected resolver exception is forwarded to the
 * application's error handler (→ 500) rather than being masked as a 404, so
 * operational failures are not hidden as missing resources.
 */
export function requireOwnership(
  resolveOwnerId: OwnerResolver,
  bypassPermission?: Permission,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }

    // A privileged role bypasses the ownership requirement outright.
    if (bypassPermission && can(req.user, bypassPermission)) {
      next();
      return;
    }

    let ownerId: string | null;
    try {
      ownerId = await resolveOwnerId(req);
    } catch (error) {
      // Only a deliberate null result means "not found". An exception is an
      // unexpected server failure (connection error, bad query, resolver bug)
      // — log it and hand it to the standard error handler as a 5xx rather
      // than converting every failure into a misleading 404.
      console.error("Ownership resolution failed:", error);
      next(error);
      return;
    }

    if (ownerId === null) {
      sendError(res, 404, "NOT_FOUND", "Resource not found");
      return;
    }

    if (ownerId !== req.user.id) {
      sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
      return;
    }

    next();
  };
}

/**
 * Guard that enforces tenant isolation: the resource's institution must match
 * the authenticated user's institution. `resolveInstitutionId` returns the
 * institution the request targets (from a param, body, or a lookup). Responds
 * 401 if unauthenticated and 403 on a cross-institution attempt. A resolver
 * that returns `null` yields 404; an unexpected resolver exception is forwarded
 * to the application's error handler (→ 500) rather than masked as a 404.
 */
export function requireSameInstitution(
  resolveInstitutionId: (req: Request) => Promise<string | null> | string | null,
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required");
      return;
    }

    let institutionId: string | null;
    try {
      institutionId = await resolveInstitutionId(req);
    } catch (error) {
      // See requireOwnership: an exception is a server failure, not a 404.
      console.error("Institution resolution failed:", error);
      next(error);
      return;
    }

    if (institutionId === null) {
      sendError(res, 404, "NOT_FOUND", "Resource not found");
      return;
    }

    if (institutionId !== req.user.institutionId) {
      sendError(res, 403, "FORBIDDEN", "Insufficient permissions");
      return;
    }

    next();
  };
}
