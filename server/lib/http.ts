import type { Response } from "express";
import type {
  ErrorDetail,
  ErrorResponse,
  SuccessResponse,
} from "../../shared/schemas/auth";

/**
 * Helpers for the standard API response envelope ({ success, data, error }).
 * Keeps route handlers thin and response shapes consistent across the API.
 */

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: SuccessResponse<T>["meta"],
): void {
  const body: SuccessResponse<T> = { success: true, data, error: null };
  if (meta) body.meta = meta;
  res.status(status).json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: ErrorDetail[],
): void {
  const body: ErrorResponse = {
    success: false,
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
  };
  res.status(status).json(body);
}

/**
 * Typed domain errors. Services throw these; the route layer maps them to the
 * appropriate HTTP status and error code.
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    readonly details?: ErrorDetail[],
  ) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT");
  }
}
