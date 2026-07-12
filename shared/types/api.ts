/**
 * Standard API contract shared across the server and the typed client.
 *
 * These types are the single source of truth for the response envelope defined
 * in `05-api-spec.md`:
 *
 *   Success: { success: true,  data: T,    error: null, meta?: {...} }
 *   Error:   { success: false, data: null, error: { code, message, details? } }
 *
 * The server shapes every response to this contract (see `server/lib/http.ts`)
 * and the client (`lib/api-client.ts`) parses against it, so both ends stay in
 * lockstep with the spec.
 */

/**
 * The complete set of error codes from the API spec's error table, each with a
 * fixed HTTP status (see {@link ERROR_STATUS}).
 */
export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

/**
 * Canonical HTTP status for each error code, exactly as tabulated in the API
 * spec. Used by the error handler to keep status and code in agreement.
 */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** A single field-level validation problem, as returned in `error.details`. */
export interface ApiErrorDetail {
  field: string;
  message: string;
}

/** The `error` object carried by an error response. */
export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: ApiErrorDetail[];
}

/** Pagination envelope metadata for list endpoints. */
export interface PaginationMeta {
  page?: number;
  limit?: number;
  total?: number;
}

/** Successful response envelope. `data` carries the payload; `error` is null. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  error: null;
  meta?: PaginationMeta;
}

/** Error response envelope. `data` is null; `error` describes the failure. */
export interface ApiErrorResponse {
  success: false;
  data: null;
  error: ApiError;
}

/** Any API response: either the success or the error shape. */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
