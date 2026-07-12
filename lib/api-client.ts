import type {
  ApiError,
  ApiErrorDetail,
  ApiResponse,
  PaginationMeta,
} from "@/shared/types/api";

/**
 * Typed API client for the Express backend.
 *
 * Wraps `fetch` to speak the standard response envelope from `05-api-spec.md`:
 * on success it unwraps and returns `data` (with `meta` for paginated lists);
 * on an error envelope — or a transport/parse failure — it throws an
 * {@link ApiClientError} carrying the spec's `code`, `message`, and any
 * field-level `details`. Callers therefore work with domain data directly and
 * handle failures via a single typed error, never by inspecting `success`.
 *
 * Auth is cookie-based (Better Auth httpOnly session), so requests are sent
 * with `credentials: "include"`; no token handling lives here.
 */

/** Base path for all endpoints, per the API spec. */
const DEFAULT_BASE_URL = "/api/v1";

/** Error thrown for any non-success outcome, mirroring the error envelope. */
export class ApiClientError extends Error {
  readonly code: ApiError["code"];
  readonly status: number;
  readonly details?: ApiErrorDetail[];

  constructor(
    code: ApiError["code"],
    message: string,
    status: number,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** A successful result, exposing the payload and any pagination metadata. */
export interface ApiResult<T> {
  data: T;
  meta?: PaginationMeta;
}

/** Query values accepted for serialisation into the request URL. */
export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  /** Query parameters; `null`/`undefined` values are omitted. */
  query?: Record<string, QueryValue>;
  /** Additional headers merged over the defaults. */
  headers?: Record<string, string>;
  /** Abort signal for cancellation/timeouts. */
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  /** Override the base URL (defaults to `/api/v1`, or `NEXT_PUBLIC_API_URL`). */
  baseUrl?: string;
  /** Override the `fetch` implementation (useful for tests). */
  fetch?: typeof fetch;
}

function resolveBaseUrl(explicit?: string): string {
  if (explicit) return explicit;
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined;
  return fromEnv ?? DEFAULT_BASE_URL;
}

/** Serialise query params, skipping null/undefined, onto a path. */
function withQuery(
  path: string,
  query?: Record<string, QueryValue>,
): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined) continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = resolveBaseUrl(options.baseUrl);
    // Bind so a passed-in fetch keeps its original `this` (e.g. window.fetch).
    this.fetchImpl = (options.fetch ?? fetch).bind(globalThis);
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>("POST", path, body, options);
  }

  patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>("PUT", path, body, options);
  }

  delete<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>> {
    return this.request<T>("DELETE", path, undefined, options);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    const url = `${this.baseUrl}${withQuery(path, options?.query)}`;
    const isJsonBody = body !== undefined;

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        // Send the httpOnly session cookie with every request.
        credentials: "include",
        body: isJsonBody ? JSON.stringify(body) : undefined,
        signal: options?.signal,
      });
    } catch (cause) {
      // Network failure, DNS error, or an aborted request — no envelope exists.
      throw new ApiClientError(
        "INTERNAL_ERROR",
        cause instanceof Error ? cause.message : "Network request failed",
        0,
      );
    }

    return this.parse<T>(response);
  }

  /** Parse a response as the standard envelope, throwing on any error shape. */
  private async parse<T>(response: Response): Promise<ApiResult<T>> {
    let payload: ApiResponse<T> | undefined;
    try {
      // A well-behaved API always returns the envelope, even for errors.
      payload = (await response.json()) as ApiResponse<T>;
    } catch {
      // Non-JSON body (gateway HTML, empty 5xx, etc.): synthesise an error.
      throw new ApiClientError(
        "INTERNAL_ERROR",
        `Unexpected non-JSON response (HTTP ${response.status})`,
        response.status,
      );
    }

    if (payload.success) {
      return { data: payload.data, meta: payload.meta };
    }

    const { error } = payload;
    throw new ApiClientError(
      error.code,
      error.message,
      response.status,
      error.details,
    );
  }
}

/**
 * Shared default client instance for app code. Points at `/api/v1` (or
 * `NEXT_PUBLIC_API_URL`) and carries the session cookie automatically.
 */
export const apiClient = new ApiClient();
